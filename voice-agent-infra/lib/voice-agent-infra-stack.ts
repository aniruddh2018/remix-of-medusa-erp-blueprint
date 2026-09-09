// Voice agent infrastructure (Nova Sonic hands-free conversation mode).
//
// Single-tenant MVP: the JWT authorizers below (both AgentCore Runtime and
// AppSync Events) point at ONE Supabase project's OIDC discovery URL, baked
// in at deploy time. Multi-tenant expansion (one Runtime per client_backend,
// or a shared Runtime with per-request tenant resolution) is a follow-up —
// not attempted here given the scope already involved in this MVP.
//
// Image build: no local Docker required. ECR + CodeBuild build the agent
// container image on AWS (see build-and-push.sh) — the Runtime resource
// references the resulting ECR image URI directly, not a CDK
// DockerImageAsset (which requires local Docker).
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { CfnRuntime, RuntimeAuthorizerConfiguration } from 'aws-cdk-lib/aws-bedrockagentcore';
import { join } from 'path';

export interface VoiceAgentStackProps extends cdk.StackProps {
  /** e.g. https://mpsmlicyzjjlwewxjtod.supabase.co/auth/v1/.well-known/openid-configuration */
  readonly supabaseOidcDiscoveryUrl: string;
  readonly supabaseUrl: string;
  readonly bedrockRegion: string;
}

export class VoiceAgentInfraStack extends cdk.Stack {
  public readonly repository: ecr.Repository;
  public readonly buildProject: codebuild.Project;

  constructor(scope: Construct, id: string, props: VoiceAgentStackProps) {
    super(scope, id, props);

    // ── ECR + CodeBuild: builds the agent container image on AWS ──────────
    this.repository = new ecr.Repository(this, 'AgentRepo', {
      repositoryName: 'voice-agent',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    });

    this.buildProject = new codebuild.Project(this, 'AgentImageBuild', {
      environment: {
        // Native ARM build environment — the Dockerfile builds for
        // linux/arm64 (matching the reference implementation), and cross-
        // compiling that on an x86_64 CodeBuild host without QEMU emulation
        // set up fails with "exec format error". Building natively on ARM
        // avoids needing emulation at all.
        buildImage: codebuild.LinuxArmBuildImage.AMAZON_LINUX_2023_STANDARD_3_0,
        privileged: true, // required for `docker build` inside CodeBuild
        computeType: codebuild.ComputeType.SMALL,
      },
      environmentVariables: {
        REPO_URI: { value: this.repository.repositoryUri },
        AWS_ACCOUNT_ID: { value: cdk.Stack.of(this).account },
        AWS_DEFAULT_REGION: { value: cdk.Stack.of(this).region },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          pre_build: {
            commands: [
              'aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com',
            ],
          },
          build: {
            commands: [
              'docker build --platform linux/arm64 -t $REPO_URI:latest -f agent.Dockerfile .',
            ],
          },
          post_build: {
            commands: ['docker push $REPO_URI:latest'],
          },
        },
      }),
    });
    this.repository.grantPullPush(this.buildProject);
    // Build source is uploaded ad-hoc to this bucket (see build-and-push.sh)
    // — reusing the existing voice-capture bucket rather than creating a
    // new one just for build staging.
    this.buildProject.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:GetObject'],
      resources: ['arn:aws:s3:::voiceerp/voice-agent-build-source/*'],
    }));

    // ── DynamoDB: conversation history for session resumption ─────────────
    const table = new dynamodb.TableV2(this, 'ConversationTable', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
    });

    // ── AppSync Events: real-time audio relay between browser and agent ──
    // Two auth providers: IAM (the agent container's own connection) and
    // OIDC (the browser's connection, validated against the same Supabase
    // project as the Runtime's own JWT authorizer below).
    const iamProvider: appsync.AppSyncAuthProvider = { authorizationType: appsync.AppSyncAuthorizationType.IAM };
    const oidcProvider: appsync.AppSyncAuthProvider = {
      authorizationType: appsync.AppSyncAuthorizationType.OIDC,
      openIdConnectConfig: { oidcProvider: props.supabaseOidcDiscoveryUrl.replace('/.well-known/openid-configuration', '') },
    };

    const eventApi = new appsync.EventApi(this, 'VoiceEventBus', {
      apiName: 'voice-agent-events',
      authorizationConfig: {
        authProviders: [iamProvider, oidcProvider],
        connectionAuthModeTypes: [appsync.AppSyncAuthorizationType.IAM, appsync.AppSyncAuthorizationType.OIDC],
        defaultPublishAuthModeTypes: [appsync.AppSyncAuthorizationType.IAM, appsync.AppSyncAuthorizationType.OIDC],
        defaultSubscribeAuthModeTypes: [appsync.AppSyncAuthorizationType.IAM, appsync.AppSyncAuthorizationType.OIDC],
      },
    });

    new appsync.ChannelNamespace(this, 'VoiceChannelNamespace', {
      api: eventApi,
      channelNamespaceName: 'voice-agent',
      code: appsync.Code.fromAsset(join(__dirname, 'resources', 'channel-handler.mjs')),
    });

    // Supabase service-role key — deliberately NOT a CfnRuntime environment
    // variable (those sit in plain text in the CloudFormation template/
    // console history forever). The secret's VALUE is set out-of-band via
    // `aws secretsmanager put-secret-value` (see the deploy notes), never
    // passed through CDK props. The agent container fetches it at startup.
    const supabaseKeySecret = new secretsmanager.Secret(this, 'SupabaseServiceRoleKey', {
      description: 'Supabase service_role key for the control-plane project — fetched by the voice agent container at startup',
    });

    // ── AgentCore Runtime: hosts the long-lived Nova Sonic session ────────
    const runtimeRole = new iam.Role(this, 'RuntimeRole', {
      assumedBy: new iam.ServicePrincipal('bedrock-agentcore.amazonaws.com'),
    });
    this.repository.grantPull(runtimeRole);
    table.grantReadWriteData(runtimeRole);
    eventApi.grantConnect(runtimeRole);
    eventApi.grantPublishAndSubscribe(runtimeRole);
    supabaseKeySecret.grantRead(runtimeRole);

    runtimeRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['bedrock:InvokeModelWithBidirectionalStream', 'bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
      resources: ['arn:aws:bedrock:*::foundation-model/*', `arn:aws:bedrock:${props.bedrockRegion}:${this.account}:*`],
    }));
    runtimeRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents', 'logs:DescribeLogGroups', 'logs:DescribeLogStreams'],
      resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/bedrock-agentcore/runtimes/*`],
    }));
    runtimeRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['ecr:GetAuthorizationToken'],
      resources: ['*'],
    }));

    new cdk.CfnOutput(this, 'RepositoryUri', { value: this.repository.repositoryUri });
    new cdk.CfnOutput(this, 'BuildProjectName', { value: this.buildProject.projectName });
    new cdk.CfnOutput(this, 'SupabaseKeySecretName', { value: supabaseKeySecret.secretName });

    // AgentCore validates that the image URI is actually pullable AT CREATE
    // TIME — it can't be created before build-and-push.sh has pushed a real
    // image (chicken-and-egg with ECR/CodeBuild being created in this same
    // stack). Two-phase deploy: `cdk deploy` first (creates ECR/CodeBuild/
    // DynamoDB/AppSync), run build-and-push.sh, then
    // `cdk deploy --context deployRuntime=true` to add the Runtime.
    if (this.node.tryGetContext('deployRuntime') === 'true') {
      const runtime = new CfnRuntime(this, 'Runtime', {
        agentRuntimeName: 'voice_erp_agent', // letters/digits/underscore only — no hyphens allowed
        agentRuntimeArtifact: {
          containerConfiguration: { containerUri: `${this.repository.repositoryUri}:latest` },
        },
        networkConfiguration: { networkMode: 'PUBLIC' },
        roleArn: runtimeRole.roleArn,
        protocolConfiguration: 'HTTP',
        // AgentCore requires at least one of allowedClients/allowedAudience/
        // allowedScopes/customClaims — Supabase JWTs carry a standard
        // `aud: "authenticated"` claim, so that's the natural one to pin.
        authorizerConfiguration: RuntimeAuthorizerConfiguration.usingJWT(props.supabaseOidcDiscoveryUrl, undefined, ['authenticated'])._render(),
        environmentVariables: {
          TABLE_NAME: table.tableName,
          EVENT_API_ENDPOINT: `https://${eventApi.httpDns}`,
          EVENT_API_REALTIME_ENDPOINT: `wss://${eventApi.realtimeDns}`,
          CHANNEL_NAMESPACE: 'voice-agent',
          BEDROCK_REGION: props.bedrockRegion,
          SUPABASE_URL: props.supabaseUrl, // not sensitive — already public in the frontend bundle
          SUPABASE_SERVICE_ROLE_KEY_SECRET_ARN: supabaseKeySecret.secretArn,
        },
      });
      new cdk.CfnOutput(this, 'AgentRuntimeArn', { value: runtime.attrAgentRuntimeArn });
    }
    new cdk.CfnOutput(this, 'EventApiHttpEndpoint', { value: `https://${eventApi.httpDns}` });
    new cdk.CfnOutput(this, 'EventApiRealtimeEndpoint', { value: `wss://${eventApi.realtimeDns}` });
  }
}
