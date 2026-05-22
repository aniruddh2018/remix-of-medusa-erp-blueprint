# ERP Integration Guide

## Overview

This guide provides comprehensive instructions for integrating the AI-powered ERP Data Import System with various external ERP systems. The system supports both API-based and file-based integrations, enabling seamless data migration from diverse ERP platforms.

## Supported ERP Systems

| ERP System | Integration Type | Authentication | Data Formats | Complexity |
|------------|-----------------|----------------|--------------|------------|
| Tally | File-based | N/A | XML, CSV, JSON | Low |
| SAP S/4HANA | API + File | OAuth 2.0, Basic Auth | CSV, XML, IDoc | High |
| Oracle NetSuite | API | OAuth 2.0, Token-based | CSV, JSON | Medium |
| Zoho Books/CRM | API | OAuth 2.0 | CSV, JSON | Medium |
| QuickBooks | API | OAuth 2.0 | CSV, IIF, JSON | Medium |
| Odoo | API + File | API Key, OAuth 2.0 | CSV, XML | Medium |
| ERPNext | API + File | API Key, Token | CSV, JSON | Low |
| Microsoft Dynamics 365 | API | OAuth 2.0 | CSV, JSON | High |
| Sage X3 | API + File | Basic Auth, OAuth 2.0 | CSV, XML | Medium |
| SAP Business One | API + File | Service Layer Auth | CSV, XML | Medium |

## Integration Architecture

### High-Level Flow

```
External ERP → Data Extraction → File Upload/API → Schema Detection → AI Mapping → Transformation → Validation → Import → Target ERP
```

### Integration Patterns

#### 1. File-Based Integration

适用于支持数据导出的ERP系统，如Tally、Odoo、ERPNext等。

**流程:**
1. 从源ERP导出数据文件（CSV、XML、JSON）
2. 通过文件上传API上传到导入系统
3. 系统自动检测 schema 并进行映射
4. 应用转换规则
5. 验证数据质量
6. 执行导入

**优点:**
- 简单易实现
- 无需API认证
- 适合大批量数据迁移
- 离线操作支持

**缺点:**
- 非实时
- 需要手动导出
- 可能需要格式转换

#### 2. API-Based Integration

适用于提供REST API的ERP系统，如SAP、Oracle NetSuite、Zoho等。

**流程:**
1. 配置API认证（OAuth 2.0、API Key等）
2. 定义数据提取端点
3. 设置定时任务或触发器
4. 系统自动调用API获取数据
5. 实时处理和导入

**优点:**
- 实时数据同步
- 自动化程度高
- 支持增量更新
- 可监控集成状态

**缺点:**
- 需要API访问权限
- 实现复杂度较高
- 受API速率限制影响

## ERP-Specific Integration Guides

### 1. Tally Integration

#### Overview
Tally is a popular accounting software in India and other regions. It primarily uses XML-based data exchange.

#### Data Export Methods

**Method 1: Tally XML Export (Recommended)**

```xml
<!-- Tally XML Export Request -->
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <SVFROMDATE>1-Apr-2025</SVFROMDATE>
          <SVTODATE>31-Mar-2026</SVTODATE>
        </STATICVARIABLES>
        <REPORTNAME>Ledger</REPORTNAME>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>
```

**Method 2: ODBC Export**

Tally supports ODBC for direct database access:

1. Enable ODBC in Tally configuration
2. Configure ODBC DSN
3. Use SQL queries to extract data
4. Export to CSV format

#### Supported Data Entities

| Entity | Tally Object | Target Entity |
|--------|-------------|---------------|
| Products | Stock Item | products |
| Suppliers | Ledger (Creditor) | suppliers |
| Customers | Ledger (Debtor) | customers |
| Inventory | Stock Summary | inventory_batches |
| Purchase Orders | Purchase Order | purchase_orders |
| Sales Orders | Sales Order | sales_orders |
| Invoices | Voucher (Sales/Purchase) | invoices |

#### Sample Tally XML to CSV Conversion

```typescript
// Tally XML Parser for Stock Items
interface TallyStockItem {
  NAME: string;
  PARENT: string;
  BASEUNITS: string;
  GSTAPPLICABLE: string;
  ITEMTYPE: string;
  ISBATCHWISEON: string;
  ISPERISHABLE: string;
}

function parseTallyStockItems(xml: string): any[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");
  const items = doc.querySelectorAll("STOCKITEM");
  
  return Array.from(items).map(item => ({
    name: item.querySelector("NAME")?.textContent,
    category: item.querySelector("PARENT")?.textContent,
    unit: item.querySelector("BASEUNITS")?.textContent,
    gst_applicable: item.querySelector("GSTAPPLICABLE")?.textContent,
    batch_managed: item.querySelector("ISBATCHWISEON")?.textContent === "Yes",
    perishable: item.querySelector("ISPERISHABLE")?.textContent === "Yes"
  }));
}
```

#### Integration Steps

1. **Configure Tally for XML Export**
   - Enable XML export in Tally
   - Set up ODBC if using direct access
   - Configure export frequency

2. **Export Data**
   - Use Tally's XML export feature
   - Export required entities (Stock Items, Ledgers, Vouchers)
   - Save XML files to local directory

3. **Upload to Import System**
   ```bash
   curl -X POST https://api.erpsystem.com/v1/files/upload \
     -H "Authorization: Bearer {access_token}" \
     -F "file=@tally_stock_items.xml" \
     -F "source_type=tally" \
     -F "entity=products"
   ```

4. **Create Import Job**
   ```json
   {
     "job_name": "Tally Products Import",
     "source_type": "xml",
     "target_entity": "products",
     "file_url": "https://storage.example.com/tally_stock_items.xml",
     "mapping_template_id": "tpl_tally_products_v1",
     "company_id": "cmp_1234567890"
   }
   ```

#### Common Challenges & Solutions

| Challenge | Solution |
|-----------|----------|
| XML structure varies by Tally version | Use version-specific parsing templates |
| Multi-level hierarchies in categories | Flatten hierarchy or create parent-child relationships |
| Batch numbers in separate tables | Use lookup resolution to link batches to products |
| GST tax codes not standard | Create enum mapping for tax codes |

---

### 2. SAP S/4HANA Integration

#### Overview
SAP S/4HANA is a comprehensive ERP suite with robust API capabilities through SAP Cloud Platform.

#### Authentication

**OAuth 2.0 Client Credentials Flow**

```typescript
// Get OAuth Token from SAP
async function getSAPToken(): Promise<string> {
  const response = await fetch("https://oauth.services.sap.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.SAP_CLIENT_ID,
      client_secret: process.env.SAP_CLIENT_SECRET
    })
  });
  
  const data = await response.json();
  return data.access_token;
}
```

#### API Endpoints

| Entity | SAP OData Service | Endpoint |
|--------|-------------------|----------|
| Products | API_PRODUCT_SRV | `/sap/opu/odata/sap/API_PRODUCT_SRV/Product` |
| Suppliers | API_BUSINESS_PARTNER_SRV | `/sap/opu/odata/sap/API_BUSINESS_PARTNER_SRV/BusinessPartner` |
| Customers | API_BUSINESS_PARTNER_SRV | `/sap/opu/odata/sap/API_BUSINESS_PARTNER_SRV/BusinessPartner` |
| Purchase Orders | API_PURCHASE_ORDER_SRV | `/sap/opu/odata/sap/API_PURCHASE_ORDER_SRV/PurchaseOrder` |
| Sales Orders | API_SALES_ORDER_SRV | `/sap/opu/odata/sap/API_SALES_ORDER_SRV/SalesOrder` |

#### Sample API Integration

```typescript
// Fetch Products from SAP
async function fetchSAPProducts(token: string): Promise<any[]> {
  const response = await fetch(
    "https://my-sap-system.com/sap/opu/odata/sap/API_PRODUCT_SRV/Product?$top=1000",
    {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json"
      }
    }
  );
  
  const data = await response.json();
  return data.d.results.map(product => ({
    sap_id: product.Product,
    name: product.ProductDescription,
    category: product.ProductGroup,
    unit: product.BaseUnit,
    weight: product.GrossWeight,
    created_at: product.CreationDate
  }));
}
```

#### IDoc Integration (Alternative)

For systems using IDoc format:

```typescript
// IDoc Parser for MATMAS (Material Master)
interface IDocSegment {
  SEGMENT: string;
  fields: Record<string, string>;
}

function parseIDoc(idocContent: string): any[] {
  const segments: IDocSegment[] = [];
  const lines = idocContent.split('\n');
  
  lines.forEach(line => {
    if (line.startsWith('E1')) {
      const segmentName = line.substring(0, 3);
      const fields = parseIDocFields(line);
      segments.push({ SEGMENT: segmentName, fields });
    }
  });
  
  return segments;
}
```

#### Integration Steps

1. **Configure SAP Cloud Platform**
   - Create communication arrangement
   - Generate OAuth client credentials
   - Enable required OData services

2. **Register Integration**
   ```json
   POST /v1/integrations/register
   {
     "erp_system": "sap_s4hana",
     "name": "SAP S/4HANA Production",
     "config": {
       "base_url": "https://my-sap-system.com",
       "oauth_url": "https://oauth.services.sap.com/oauth2/token",
       "client_id": "sap_client_id",
       "client_secret": "***",
       "api_services": [
         "API_PRODUCT_SRV",
         "API_BUSINESS_PARTNER_SRV",
         "API_PURCHASE_ORDER_SRV"
       ]
     }
   }
   ```

3. **Test Connection**
   ```bash
   curl -X POST https://api.erpsystem.com/v1/integrations/sap/test \
     -H "Authorization: Bearer {access_token}"
   ```

4. **Schedule Data Sync**
   ```json
   POST /v1/integrations/sap/schedule
   {
     "entities": ["products", "suppliers", "customers"],
     "frequency": "daily",
     "time": "02:00",
     "incremental": true
   }
   ```

#### Common Challenges & Solutions

| Challenge | Solution |
|-----------|----------|
| API rate limits (SAP has strict limits) | Implement batch processing with exponential backoff |
| Complex data structures in OData | Use field mapping to flatten nested structures |
| IDoc format variations | Use IDoc type-specific parsers |
| Multi-language support | Configure language parameter in API calls |

---

### 3. Oracle NetSuite Integration

#### Overview
Oracle NetSuite provides REST APIs and SuiteScript for data access.

#### Authentication

**OAuth 2.0 with TBA (Token-Based Authentication)**

```typescript
// NetSuite OAuth 1.0a (TBA)
import crypto from 'crypto';

function generateNetSuiteSignature(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerKey: string,
  consumerSecret: string,
  token: string,
  tokenSecret: string
): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(16).toString('hex');
  
  const baseString = [
    method,
    encodeURIComponent(url),
    encodeURIComponent(Object.entries(params)
      .sort()
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&'))
  ].join('&');
  
  const signingKey = `${consumerSecret}&${tokenSecret}`;
  const signature = crypto
    .createHmac('sha256', signingKey)
    .update(baseString)
    .digest('base64');
  
  return signature;
}
```

#### RESTlet Integration

Create a custom RESTlet in NetSuite for optimized data extraction:

```javascript
// NetSuite RESTlet (deployed in NetSuite)
/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 */
define(['N/search'], (search) => {
  function get(context) {
    const entity = context.parameters.entity;
    const lastModified = context.parameters.lastModified;
    
    let searchObj;
    
    if (entity === 'products') {
      searchObj = search.create({
        type: search.Type.INVENTORY_ITEM,
        filters: [
          ['lastmodifieddate', 'after', lastModified]
        ],
        columns: [
          'internalid',
          'itemid',
          'displayname',
          'type',
          'baseprice'
        ]
      });
    }
    
    const results = [];
    searchObj.run().each(result => {
      results.push({
        id: result.getValue('internalid'),
        sku: result.getValue('itemid'),
        name: result.getValue('displayname'),
        type: result.getValue('type'),
        price: result.getValue('baseprice')
      });
      return true;
    });
    
    return JSON.stringify(results);
  }
  
  return { get };
});
```

#### SuiteTalk (SOAP API) Integration

For complex operations, use SuiteTalk:

```typescript
// SuiteTalk SOAP Client
import { NetSuiteClient } from 'netsuite-soap-client';

const client = new NetSuiteClient({
  account: 'ACCOUNT_ID',
  email: 'user@company.com',
  password: 'password',
  role: '3',
  applicationId: 'APPLICATION_ID'
});

async function fetchNetSuiteItems(): Promise<any[]> {
  const search = await client.search({
    recordType: 'Item',
    basic: {
      type: {
        operator: 'anyOf',
        searchValue: ['InvtPart', 'Assembly', 'Kit']
      }
    }
  });
  
  return search.recordList.record.map(item => ({
    netsuite_id: item.internalId,
    name: item.displayName,
    sku: item.itemId,
    type: item.type,
    base_price: item.basePrice
  }));
}
```

#### Integration Steps

1. **Enable TBA in NetSuite**
   - Go to Setup > Company > Enable Features > SuiteCloud
   - Enable Token-Based Authentication
   - Create Integration Record
   - Generate Access Token

2. **Configure Integration**
   ```json
   POST /v1/integrations/netsuite/register
   {
     "erp_system": "netsuite",
     "name": "NetSuite Production",
     "config": {
       "account_id": "ACCOUNT_ID",
       "realm": "SB1",
       "consumer_key": "consumer_key",
       "consumer_secret": "***",
       "token_id": "token_id",
       "token_secret": "***",
       "restlet_url": "https://ACCOUNT_ID.restlets.api.netsuite.com/app/site/hosting/restlet.nl"
     }
   }
   ```

3. **Deploy Custom RESTlet**
   - Create RESTlet script in NetSuite
   - Deploy to specific role
   - Note the script deployment URL

4. **Test and Sync**
   ```bash
   # Test connection
   curl -X POST https://api.erpsystem.com/v1/integrations/netsuite/test \
     -H "Authorization: Bearer {access_token}"
   
   # Trigger sync
   curl -X POST https://api.erpsystem.com/v1/integrations/netsuite/sync \
     -H "Authorization: Bearer {access_token}" \
     -d '{"entity": "products"}'
   ```

#### Common Challenges & Solutions

| Challenge | Solution |
|-----------|----------|
| OAuth 1.0a signature complexity | Use official NetSuite SDK or library |
| Governance limits (5,000 API calls/month) | Implement caching and batch processing |
| Custom fields not in standard API | Use RESTlet to expose custom fields |
| Subsidiary data isolation | Configure subsidiary filter in queries |

---

### 4. Zoho Books/CRM Integration

#### Overview
Zoho provides REST APIs with OAuth 2.0 authentication for Books and CRM.

#### Authentication

**OAuth 2.0 Authorization Code Flow**

```typescript
// Step 1: Get Authorization Code
const authUrl = `https://accounts.zoho.com/oauth/v2/auth?scope=${encodeURIComponent('ZohoBooks.contacts.READ,ZohoBooks.items.READ')}&client_id=${CLIENT_ID}&response_type=code&redirect_uri=${REDIRECT_URI}&access_type=offline`;

// Step 2: Exchange Code for Tokens
async function getZohoTokens(code: string): Promise<any> {
  const response = await fetch("https://accounts.zoho.com/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: code,
      redirect_uri: REDIRECT_URI
    })
  });
  
  return await response.json();
}

// Step 3: Refresh Token
async function refreshZohoToken(refreshToken: string): Promise<string> {
  const response = await fetch("https://accounts.zoho.com/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken
    })
  });
  
  const data = await response.json();
  return data.access_token;
}
```

#### API Endpoints

| Entity | Zoho Books API | Endpoint |
|--------|----------------|----------|
| Products | Items | `/books/v3/items` |
| Suppliers | Contacts (Vendor) | `/books/v3/contacts?filter_by=Vendor` |
| Customers | Contacts (Customer) | `/books/v3/contacts?filter_by=Customer` |
| Purchase Orders | Purchase Orders | `/books/v3/purchaseorders` |
| Sales Orders | Sales Orders | `/books/v3/salesorders` |
| Invoices | Invoices | `/books/v3/invoices` |

#### Sample API Integration

```typescript
// Fetch Items from Zoho Books
async function fetchZohoItems(accessToken: string, organizationId: string): Promise<any[]> {
  const response = await fetch(
    `https://books.zoho.com/api/v3/items?organization_id=${organizationId}`,
    {
      headers: {
        "Authorization": `Zoho-oauthtoken ${accessToken}`
      }
    }
  );
  
  const data = await response.json();
  return data.items.map(item => ({
    zoho_id: item.item_id,
    name: item.name,
    sku: item.sku,
    rate: item.rate,
    purchase_rate: item.purchase_rate,
    item_type: item.item_type,
    tax_id: item.tax_id
  }));
}

// Fetch Contacts (Suppliers/Customers)
async function fetchZohoContacts(
  accessToken: string,
  organizationId: string,
  contactType: 'vendor' | 'customer'
): Promise<any[]> {
  const response = await fetch(
    `https://books.zoho.com/api/v3/contacts?organization_id=${organizationId}&filter_by=${contactType === 'vendor' ? 'Vendor' : 'Customer'}`,
    {
      headers: {
        "Authorization": `Zoho-oauthtoken ${accessToken}`
      }
    }
  );
  
  const data = await response.json();
  return data.contacts.map(contact => ({
    zoho_id: contact.contact_id,
    name: contact.contact_name,
    email: contact.email,
    phone: contact.phone,
    address: contact.billing_address,
    gst_treatment: contact.gst_treatment,
    gstin: contact.gstin
  }));
}
```

#### Integration Steps

1. **Create Zoho Client**
   - Go to Zoho Developer Console
   - Create Self Client
   - Note Client ID and Secret
   - Set up Redirect URI

2. **Authorize Application**
   - Direct user to authorization URL
   - Capture authorization code
   - Exchange for access and refresh tokens

3. **Configure Integration**
   ```json
   POST /v1/integrations/zoho/register
   {
     "erp_system": "zoho_books",
     "name": "Zoho Books Production",
     "config": {
       "client_id": "zoho_client_id",
       "client_secret": "***",
       "refresh_token": "***",
       "organization_id": "ORG_ID",
       "data_center": "com"
     }
   }
   ```

4. **Schedule Sync**
   ```json
   POST /v1/integrations/zoho/schedule
   {
     "entities": ["items", "contacts"],
     "frequency": "hourly",
     "incremental": true,
     "webhook_url": "https://api.erpsystem.com/v1/webhooks/zoho"
   }
   ```

#### Webhook Integration (Real-time Updates)

Configure Zoho webhooks for real-time data sync:

```typescript
// Zoho Webhook Handler
app.post('/webhooks/zoho', async (req, res) => {
  const { event_type, data } = req.body;
  
  if (event_type === 'item.created' || event_type === 'item.updated') {
    await triggerImportJob({
      source_type: 'zoho_api',
      target_entity: 'products',
      entity_id: data.item_id,
      sync_type: 'incremental'
    });
  }
  
  res.status(200).send('OK');
});
```

#### Common Challenges & Solutions

| Challenge | Solution |
|-----------|----------|
| Token expiration (1 hour) | Implement automatic token refresh |
| Organization-specific data | Configure organization ID per integration |
| Rate limits (100 requests/day for free) | Use batch API endpoints |
| Multi-currency support | Configure currency conversion rules |

---

### 5. QuickBooks Integration

#### Overview
QuickBooks Online provides REST APIs with OAuth 2.0 authentication.

#### Authentication

**OAuth 2.0 Authorization Code Flow**

```typescript
// QuickBooks OAuth 2.0
const QB_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const QB_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

async function getQuickBooksTokens(code: string): Promise<any> {
  const response = await fetch(QB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    })
  });
  
  return await response.json();
}
```

#### API Endpoints

| Entity | QuickBooks API | Endpoint |
|--------|----------------|----------|
| Products | Item | `/v3/company/{realmId}/item?operation=query` |
| Suppliers | Vendor | `/v3/company/{realmId}/vendor?operation=query` |
| Customers | Customer | `/v3/company/{realmId}/customer?operation=query` |
| Purchase Orders | Purchase Order | `/v3/company/{realmId}/purchaseorder?operation=query` |
| Sales Orders | Sales Order | `/v3/company/{realmId}/salesorder?operation=query` |
| Invoices | Invoice | `/v3/company/{realmId}/invoice?operation=query` |

#### Sample API Integration

```typescript
// Fetch Items from QuickBooks
async function fetchQuickBooksItems(accessToken: string, realmId: string): Promise<any[]> {
  const response = await fetch(
    `https://quickbooks.api.intuit.com/v3/company/${realmId}/query?query=select * from Item maxResults 1000`,
    {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/json"
      }
    }
  );
  
  const data = await response.json();
  return data.QueryResponse.Item.map(item => ({
    qb_id: item.Id,
    name: item.Name,
    sku: item.Sku,
    type: item.Type,
    income_account: item.IncomeAccountRef?.name,
    expense_account: item.ExpenseAccountRef?.name,
    purchase_cost: item.PurchaseCost,
    unit_price: item.UnitPrice
  }));
}
```

#### IIF File Import (Alternative)

QuickBooks IIF format for file-based import:

```
!TRNS	TRNSID	TRNSTYPE	DATE	ACCNT	NAME	CLASS	AMOUNT	DOCNUM	MEMO
!SPL	SPLID	TRNSTYPE	DATE	ACCNT	NAME	CLASS	AMOUNT	DOCNUM	MEMO
!ENDTRNS

TRNS		INVOICE	01/15/2025	Accounts Receivable	Customer A		1000.00	INV-001	Sale
SPL			INVOICE	01/15/2025	Sales Revenue			1000.00	INV-001	
ENDTRNS
```

#### Integration Steps

1. **Create QuickBooks App**
   - Go to QuickBooks Developer Portal
   - Create new app
   - Configure OAuth 2.0
   - Set scopes

2. **Configure Integration**
   ```json
   POST /v1/integrations/quickbooks/register
   {
     "erp_system": "quickbooks_online",
     "name": "QuickBooks Online Production",
     "config": {
       "client_id": "qb_client_id",
       "client_secret": "***",
       "refresh_token": "***",
       "realm_id": "REALM_ID",
       "environment": "production"
     }
   }
   ```

3. **Handle OAuth Callback**
   ```typescript
   app.get('/auth/quickbooks/callback', async (req, res) => {
     const { code, realmId } = req.query;
     const tokens = await getQuickBooksTokens(code);
     
     // Save tokens and realm ID
     await saveIntegrationConfig({
       erp_system: 'quickbooks_online',
       access_token: tokens.access_token,
       refresh_token: tokens.refresh_token,
       realm_id: realmId
     });
     
     res.redirect('/dashboard');
   });
   ```

#### Common Challenges & Solutions

| Challenge | Solution |
|-----------|----------|
| Realm ID required for each request | Store realm ID after OAuth callback |
| Token expiration (1 hour) | Implement refresh token rotation |
| Query syntax limitations | Use QuickBooks Query Language (QBOQL) carefully |
| Batch size limits (1000 items) | Implement pagination with `StartPosition` |

---

### 6. Odoo Integration

#### Overview
Odoo provides REST API and XML-RPC interfaces for data access.

#### Authentication

**API Key Authentication**

```typescript
// Odoo API Key Authentication
async function authenticateOdoo(
  url: string,
  db: string,
  username: string,
  apiKey: string
): Promise<string> {
  const response = await fetch(`${url}/web/session/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      params: {
        db: db,
        login: username,
        password: apiKey
      }
    })
  });
  
  const data = await response.json();
  return data.result.session_id;
}
```

#### XML-RPC Integration

```typescript
// Odoo XML-RPC Client
import { xmlrpc } from 'xmlrpc';

const client = xmlrpc.createClient(`${odooUrl}/xmlrpc/2/common`);

async function authenticateOdooXMLRPC(
  db: string,
  username: string,
  password: string
): Promise<number> {
  return new Promise((resolve, reject) => {
    client.methodCall('authenticate', [db, username, password, {}], (err, uid) => {
      if (err) reject(err);
      else resolve(uid);
    });
  });
}

async function fetchOdooProducts(uid: number, password: string): Promise<any[]> {
  const models = xmlrpc.createClient(`${odooUrl}/xmlrpc/2/object`);
  
  return new Promise((resolve, reject) => {
    models.methodCall('execute_kw', [
      db,
      uid,
      password,
      'product.product',
      'search_read',
      [[]],
      { fields: ['name', 'default_code', 'list_price', 'categ_id'] }
    ], (err, products) => {
      if (err) reject(err);
      else resolve(products);
    });
  });
}
```

#### REST API Integration

```typescript
// Odoo REST API (Odoo 14+)
async function fetchOdooProductsREST(sessionId: string): Promise<any[]> {
  const response = await fetch(`${odooUrl}/api/product.product`, {
    headers: {
      "Cookie": `session_id=${sessionId}`
    }
  });
  
  return await response.json();
}
```

#### CSV Export Integration

Odoo supports CSV export directly from UI or via API:

```typescript
// Trigger CSV Export
async function exportOdooToCSV(
  sessionId: string,
  model: string,
  fields: string[]
): Promise<string> {
  const response = await fetch(`${odooUrl}/web/export/csv`, {
    method: "POST",
    headers: {
      "Cookie": `session_id=${sessionId}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: model,
      fields: fields.map(f => ({ name: f, label: f })),
      domain: [],
      context: {}
    })
  });
  
  return await response.text();
}
```

#### Integration Steps

1. **Enable API Access in Odoo**
   - Go to Settings > General Settings
   - Enable API keys
   - Create API key for integration user

2. **Configure Integration**
   ```json
   POST /v1/integrations/odoo/register
   {
     "erp_system": "odoo",
     "name": "Odoo Production",
     "config": {
       "url": "https://my-odoo-instance.com",
       "db": "production_db",
       "username": "api_user",
       "api_key": "***",
       "integration_type": "xmlrpc"
     }
   }
   ```

3. **Test Connection**
   ```bash
   curl -X POST https://api.erpsystem.com/v1/integrations/odoo/test \
     -H "Authorization: Bearer {access_token}"
   ```

#### Common Challenges & Solutions

| Challenge | Solution |
|-----------|----------|
| XML-RPC complexity | Use official Odoo client libraries |
| Multi-company support | Configure company ID in context |
| Custom module fields | Include field names in search_read |
| Rate limiting | Implement request throttling |

---

### 7. ERPNext Integration

#### Overview
ERPNext is an open-source ERP with REST API and Python scripting capabilities.

#### Authentication

**API Token Authentication**

```typescript
// ERPNext API Token
async function fetchERPNextData(
  url: string,
  resource: string,
  apiKey: string,
  apiSecret: string
): Promise<any> {
  const response = await fetch(`${url}/api/resource/${resource}`, {
    headers: {
      "Authorization": `token ${apiKey}:${apiSecret}`
    }
  });
  
  return await response.json();
}
```

#### API Endpoints

| Entity | ERPNext Resource | Endpoint |
|--------|------------------|----------|
| Products | Item | `/api/resource/Item` |
| Suppliers | Supplier | `/api/resource/Supplier` |
| Customers | Customer | `/api/resource/Customer` |
| Purchase Orders | Purchase Order | `/api/resource/Purchase Order` |
| Sales Orders | Sales Order | `/api/resource/Sales Order` |
| Invoices | Sales Invoice | `/api/resource/Sales Invoice` |

#### Sample API Integration

```typescript
// Fetch Items from ERPNext
async function fetchERPNextItems(
  url: string,
  apiKey: string,
  apiSecret: string
): Promise<any[]> {
  const response = await fetch(
    `${url}/api/resource/Item?fields=["item_code","item_name","item_group","stock_uom","standard_rate"]&limit_page_length=1000`,
    {
      headers: {
        "Authorization": `token ${apiKey}:${apiSecret}`
      }
    }
  );
  
  const data = await response.json();
  return data.data.map(item => ({
    erpnext_id: item.name,
    sku: item.item_code,
    name: item.item_name,
    category: item.item_group,
    unit: item.stock_uom,
    standard_rate: item.standard_rate
  }));
}
```

#### CSV Export Integration

ERPNext supports CSV export via API:

```typescript
// Export to CSV
async function exportERPNextToCSV(
  url: string,
  doctype: string,
  apiKey: string,
  apiSecret: string
): Promise<string> {
  const response = await fetch(
    `${url}/api/method/frappe.desk.reportview.get_csv?doctype=${doctype}`,
    {
      headers: {
        "Authorization": `token ${apiKey}:${apiSecret}`
      }
    }
  );
  
  return await response.text();
}
```

#### Integration Steps

1. **Generate API Token**
   - Go to User > API Access
   - Generate API Key and Secret
   - Note both values

2. **Configure Integration**
   ```json
   POST /v1/integrations/erpnext/register
   {
     "erp_system": "erpnext",
     "name": "ERPNext Production",
     "config": {
       "url": "https://my-erpnext-instance.com",
       "api_key": "***",
       "api_secret": "***"
     }
   }
   ```

3. **Test and Sync**
   ```bash
   # Test connection
   curl -X POST https://api.erpsystem.com/v1/integrations/erpnext/test \
     -H "Authorization: Bearer {access_token}"
   
   # Trigger sync
   curl -X POST https://api.erpsystem.com/v1/integrations/erpnext/sync \
     -H "Authorization: Bearer {access_token}" \
     -d '{"entity": "Item"}'
   ```

#### Common Challenges & Solutions

| Challenge | Solution |
|-----------|----------|
| API token permissions | Ensure user has appropriate role permissions |
| Field naming conventions | Map ERPNext snake_case to target schema |
| Custom doctypes | Configure custom resource endpoints |
| Rate limiting (1000 requests/hour) | Implement batch processing |

---

### 8. Microsoft Dynamics 365 Integration

#### Overview
Microsoft Dynamics 365 provides OData and Web API endpoints.

#### Authentication

**OAuth 2.0 with Azure AD**

```typescript
// Dynamics 365 OAuth 2.0
async function getDynamicsToken(): Promise<string> {
  const response = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        scope: "https://${ORG}.crm.dynamics.com/.default"
      })
    }
  );
  
  const data = await response.json();
  return data.access_token;
}
```

#### API Endpoints

| Entity | Dynamics 365 API | Endpoint |
|--------|------------------|----------|
| Products | Product | `/api/data/v9.2/products` |
| Suppliers | Account (Vendor) | `/api/data/v9.2/accounts?$filter=customertypecode eq 1` |
| Customers | Account (Customer) | `/api/data/v9.2/accounts?customertypecode eq 3` |
| Purchase Orders | Purchase Order | `/api/data/v9.2/purchaseorders` |
| Sales Orders | Sales Order | `/api/data/v9.2/salesorders` |
| Invoices | Invoice | `/api/data/v9.2/invoices` |

#### Sample API Integration

```typescript
// Fetch Products from Dynamics 365
async function fetchDynamicsProducts(accessToken: string, org: string): Promise<any[]> {
  const response = await fetch(
    `https://${org}.crm.dynamics.com/api/data/v9.2/products?$select=name,productnumber,defaultuomscheduleid,standardcost`,
    {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/json",
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0"
      }
    }
  );
  
  const data = await response.json();
  return data.value.map(product => ({
    dynamics_id: product.productid,
    name: product.name,
    sku: product.productnumber,
    unit_schedule: product.defaultuomscheduleid,
    standard_cost: product.standardcost
  }));
}
```

#### Integration Steps

1. **Register App in Azure AD**
   - Go to Azure Portal > App Registrations
   - Create new app registration
   - Configure API permissions (Dynamics CRM)
   - Generate client secret

2. **Configure Integration**
   ```json
   POST /v1/integrations/dynamics365/register
   {
     "erp_system": "dynamics_365",
     "name": "Dynamics 365 Production",
     "config": {
       "tenant_id": "TENANT_ID",
       "client_id": "CLIENT_ID",
       "client_secret": "***",
       "organization": "org12345",
       "environment": "production"
     }
   }
   ```

3. **Test Connection**
   ```bash
   curl -X POST https://api.erpsystem.com/v1/integrations/dynamics365/test \
     -H "Authorization: Bearer {access_token}"
   ```

#### Common Challenges & Solutions

| Challenge | Solution |
|-----------|----------|
| Complex OAuth flow with Azure AD | Use MSAL library for authentication |
| OData query syntax complexity | Use OData query builder libraries |
| Multi-tenant environments | Configure organization URL per tenant |
| Rate limiting (60 requests/min) | Implement batch API requests |

---

### 9. Sage X3 Integration

#### Overview
Sage X3 provides REST APIs and SOAP web services.

#### Authentication

**Basic Authentication**

```typescript
// Sage X3 Basic Auth
async function fetchSageX3Data(
  url: string,
  endpoint: string,
  username: string,
  password: string
): Promise<any> {
  const credentials = btoa(`${username}:${password}`);
  const response = await fetch(`${url}/${endpoint}`, {
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Accept": "application/json"
    }
  });
  
  return await response.json();
}
```

#### API Endpoints

| Entity | Sage X3 API | Endpoint |
|--------|-------------|----------|
| Products | BPR (Product) | `/BPR` |
| Suppliers | BPS (Supplier) | `/BPS?$filter=BPSFCY='SUP'` |
| Customers | BPS (Customer) | `/BPS?$filter=BPSFCY='CUS'` |
| Purchase Orders | POH (Purchase Order) | `/POH` |
| Sales Orders | SOH (Sales Order) | `/SOH` |

#### Sample API Integration

```typescript
// Fetch Products from Sage X3
async function fetchSageX3Products(
  url: string,
  username: string,
  password: string
): Promise<any[]> {
  const response = await fetch(
    `${url}/BPR?$select=BPRNUM,BPRDES,ITMREF,STUFCY`,
    {
      headers: {
        "Authorization": `Basic ${btoa(`${username}:${password}`)}`,
        "Accept": "application/json"
      }
    }
  );
  
  const data = await response.json();
  return data.value.map(product => ({
    sage_id: product.BPRNUM,
    name: product.BPRDES,
    item_ref: product.ITMREF,
    unit: product.STUFCY
  }));
}
```

#### Integration Steps

1. **Enable API Access in Sage X3**
   - Go to Administration > Authorizations
   - Enable REST API
   - Create API user with appropriate permissions

2. **Configure Integration**
   ```json
   POST /v1/integrations/sagex3/register
   {
     "erp_system": "sage_x3",
     "name": "Sage X3 Production",
     "config": {
       "url": "https://my-sage-x3.com",
       "username": "api_user",
       "password": "***",
       "endpoint": "/sage-x3-api"
     }
   }
   ```

#### Common Challenges & Solutions

| Challenge | Solution |
|-----------|----------|
| Field naming conventions (3-letter codes) | Create field mapping for Sage codes |
| Multi-company support | Configure company code in requests |
| SOAP vs REST endpoints | Choose based on Sage X3 version |
| Session management | Handle session tokens properly |

---

### 10. SAP Business One Integration

#### Overview
SAP Business One provides Service Layer (REST API) and DI API.

#### Authentication

**Basic Authentication**

```typescript
// SAP Business One Service Layer
async function authenticateSAPB1(
  url: string,
  company: string,
  username: string,
  password: string
): Promise<string> {
  const response = await fetch(`${url}/Login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      CompanyDB: company,
      UserName: username,
      Password: password
    })
  });
  
  const data = await response.json();
  return data.SessionId;
}
```

#### API Endpoints

| Entity | SAP B1 Service Layer | Endpoint |
|--------|----------------------|----------|
| Products | Items | `/Items` |
| Suppliers | Business Partners | `/BusinessPartners?$filter=CardType eq 'S'` |
| Customers | Business Partners | `/BusinessPartners?$filter=CardType eq 'C'` |
| Purchase Orders | Purchase Orders | `/PurchaseOrders` |
| Sales Orders | Sales Orders | `/SalesOrders` |

#### Sample API Integration

```typescript
// Fetch Items from SAP Business One
async function fetchSAPB1Items(
  url: string,
  sessionId: string
): Promise<any[]> {
  const response = await fetch(`${url}/Items`, {
    headers: {
      "Cookie": `B1SESSION=${sessionId}`,
      "Accept": "application/json"
    }
  });
  
  const data = await response.json();
  return data.value.map(item => ({
    sapb1_id: item.ItemCode,
    name: item.ItemName,
    item_group: item.ItemsGroupCode,
    unit: item.InventoryUOM,
    price: item.Price
  }));
}
```

#### Integration Steps

1. **Enable Service Layer**
   - Go to SAP Business One Service Layer Configuration
   - Enable REST API
   - Configure port and SSL

2. **Configure Integration**
   ```json
   POST /v1/integrations/sapb1/register
   {
     "erp_system": "sap_business_one",
     "name": "SAP Business One Production",
     "config": {
       "url": "https://my-sapb1.com:50000",
       "company_db": "SBODEMO_US",
       "username": "manager",
       "password": "***"
     }
   }
   ```

#### Common Challenges & Solutions

| Challenge | Solution |
|-----------|----------|
| Session timeout (30 minutes) | Implement session refresh logic |
| Database-specific endpoints | Configure company DB per integration |
| Field length limitations | Truncate or map to appropriate fields |
| Multi-currency support | Configure currency code in requests |

---

## Generic Integration Patterns

### File Upload Pattern

适用于所有支持文件导出的ERP系统。

```typescript
// Generic File Upload Integration
async function importFromFile(
  filePath: string,
  sourceType: string,
  targetEntity: string,
  mappingTemplateId: string
): Promise<string> {
  // 1. Upload file
  const uploadResponse = await fetch('/v1/files/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'multipart/form-data'
    },
    body: new FormData().append('file', fs.createReadStream(filePath))
  });
  
  const { file_url } = await uploadResponse.json();
  
  // 2. Create import job
  const jobResponse = await fetch('/v1/import/jobs', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      job_name: `${sourceType} ${targetEntity} Import`,
      source_type: sourceType,
      target_entity: targetEntity,
      file_url: file_url,
      mapping_template_id: mappingTemplateId,
      company_id: companyId
    })
  });
  
  const { id } = await jobResponse.json();
  return id;
}
```

### API Polling Pattern

适用于支持API的ERP系统。

```typescript
// Generic API Polling Integration
async function syncFromAPI(
  erpSystem: string,
  entity: string,
  lastSyncDate?: Date
): Promise<void> {
  const integration = await getIntegrationConfig(erpSystem);
  
  // 1. Fetch data from ERP
  const data = await fetchERPData(integration, entity, lastSyncDate);
  
  // 2. Convert to CSV for import
  const csv = convertToCSV(data);
  
  // 3. Upload and create import job
  const jobId = await importFromCSV(csv, erpSystem, entity);
  
  // 4. Update last sync timestamp
  await updateLastSync(erpSystem, entity, new Date());
}
```

### Webhook Pattern

适用于支持webhook的ERP系统，实现实时同步。

```typescript
// Generic Webhook Handler
app.post('/webhooks/:erp_system', async (req, res) => {
  const { erp_system } = req.params;
  const { event_type, data } = req.body;
  
  // Verify webhook signature if required
  if (!verifyWebhookSignature(erp_system, req)) {
    return res.status(401).send('Invalid signature');
  }
  
  // Map event to import job
  const entity = mapEventToEntity(event_type);
  
  // Trigger incremental import
  await triggerImportJob({
    source_type: `${erp_system}_api`,
    target_entity: entity,
    entity_id: data.id,
    sync_type: 'incremental'
  });
  
  res.status(200).send('OK');
});
```

## Configuration Management

### Integration Configuration Schema

```typescript
interface IntegrationConfig {
  id: string;
  erp_system: string;
  name: string;
  config: {
    // Authentication
    auth_type: 'oauth2' | 'basic' | 'api_key' | 'token';
    client_id?: string;
    client_secret?: string;
    api_key?: string;
    username?: string;
    password?: string;
    refresh_token?: string;
    
    // Connection
    base_url?: string;
    organization_id?: string;
    company_db?: string;
    tenant_id?: string;
    
    // ERP-specific
    realm_id?: string; // QuickBooks
    data_center?: string; // Zoho
    environment?: 'sandbox' | 'production';
    
    // Sync settings
    sync_frequency?: 'realtime' | 'hourly' | 'daily' | 'weekly';
    incremental_sync?: boolean;
    webhook_url?: string;
  };
  
  status: 'active' | 'inactive' | 'error';
  last_sync_at?: Date;
  error_message?: string;
  
  created_at: Date;
  updated_at: Date;
}
```

### Storing Integration Secrets

使用环境变量或密钥管理服务存储敏感信息：

```typescript
// Environment Variable Pattern
const INTEGRATION_SECRETS = {
  netsuite: {
    consumer_secret: process.env.NETSUITE_CONSUMER_SECRET,
    token_secret: process.env.NETSUITE_TOKEN_SECRET
  },
  quickbooks: {
    client_secret: process.env.QB_CLIENT_SECRET,
    refresh_token: process.env.QB_REFRESH_TOKEN
  },
  // ... other integrations
};

// Or use AWS Secrets Manager / Azure Key Vault
async function getSecret(secretName: string): Promise<string> {
  const secret = await secretsManager.getSecretValue({ SecretId: secretName });
  return secret.SecretString;
}
```

## Error Handling & Retry Logic

### Exponential Backoff

```typescript
async function fetchWithRetry(
  fn: () => Promise<any>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<any> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      if (i === maxRetries - 1) throw error;
      
      const delay = baseDelay * Math.pow(2, i);
      console.log(`Retry ${i + 1}/${maxRetries} after ${delay}ms`);
      await sleep(delay);
    }
  }
}
```

### Rate Limit Handling

```typescript
async function fetchWithRateLimit(
  fn: () => Promise<any>,
  rateLimit: number // requests per minute
): Promise<any> {
  const now = Date.now();
  const windowStart = Math.floor(now / 60000) * 60000;
  
  if (!rateLimitWindow[windowStart]) {
    rateLimitWindow[windowStart] = 0;
  }
  
  if (rateLimitWindow[windowStart] >= rateLimit) {
    const waitTime = windowStart + 60000 - now;
    console.log(`Rate limit reached, waiting ${waitTime}ms`);
    await sleep(waitTime);
  }
  
  rateLimitWindow[windowStart]++;
  return await fn();
}
```

## Testing & Validation

### Integration Testing Checklist

- [ ] Authentication successful
- [ ] API endpoints accessible
- [ ] Data retrieval returns expected fields
- [ ] Field mapping configured correctly
- [ ] Data transformation applied
- [ ] Validation rules pass
- [ ] Import job completes successfully
- [ ] Data integrity verified in target system
- [ ] Error handling works for edge cases
- [ ] Rate limits respected

### Sample Test Script

```typescript
// Integration Test Script
async function testIntegration(erpSystem: string): Promise<void> {
  console.log(`Testing ${erpSystem} integration...`);
  
  // 1. Test authentication
  const authResult = await testAuthentication(erpSystem);
  console.log('Authentication:', authResult ? 'PASS' : 'FAIL');
  
  // 2. Test data fetch
  const data = await fetchData(erpSystem, 'products', 10);
  console.log('Data fetch:', data.length > 0 ? 'PASS' : 'FAIL');
  
  // 3. Test mapping
  const mapped = await applyMapping(data, erpSystem);
  console.log('Mapping:', mapped.length > 0 ? 'PASS' : 'FAIL');
  
  // 4. Test validation
  const validation = await validateData(mapped);
  console.log('Validation:', validation.errors.length === 0 ? 'PASS' : 'FAIL');
  
  // 5. Test import (dry run)
  const importResult = await testImport(mapped, true);
  console.log('Import (dry run):', importResult.success ? 'PASS' : 'FAIL');
}
```

## Monitoring & Logging

### Integration Metrics

```typescript
interface IntegrationMetrics {
  integration_id: string;
  erp_system: string;
  
  // Sync metrics
  last_sync_at: Date;
  sync_duration_ms: number;
  records_processed: number;
  records_success: number;
  records_failed: number;
  
  // Error metrics
  error_rate: number;
  last_error_at?: Date;
  last_error_message?: string;
  
  // Performance metrics
  avg_response_time_ms: number;
  p95_response_time_ms: number;
  p99_response_time_ms: number;
}
```

### Logging Best Practices

```typescript
// Structured Logging
logger.info('Integration sync started', {
  integration_id: integration.id,
  erp_system: integration.erp_system,
  entity: entity,
  sync_type: 'full'
});

logger.error('Integration sync failed', {
  integration_id: integration.id,
  error: error.message,
  stack: error.stack,
  retry_count: retryCount
});

logger.warn('Rate limit approaching', {
  integration_id: integration.id,
  requests_remaining: rateLimit.remaining,
  reset_at: rateLimit.resetAt
});
```

## Security Considerations

### 1. Credential Storage

- Never store credentials in code
- Use environment variables or secret managers
- Rotate credentials regularly
- Use least-privilege access

### 2. Data Encryption

- Encrypt data at rest (AES-256)
- Use TLS for data in transit
- Mask sensitive data in logs

### 3. Access Control

- Implement RBAC for integration access
- Audit integration usage
- Revoke access when no longer needed

### 4. Webhook Security

- Verify webhook signatures
- Use HTTPS endpoints
- Validate request origins

## Troubleshooting Guide

### Common Issues

| Issue | Possible Cause | Solution |
|-------|----------------|----------|
| Authentication failed | Invalid credentials, token expired | Refresh tokens, verify credentials |
| Rate limit exceeded | Too many requests | Implement backoff, reduce frequency |
| Data format mismatch | ERP version differences | Update mapping templates |
| Field mapping errors | Schema changes | Re-run schema detection |
| Import validation fails | Data quality issues | Review validation errors, fix data |
| Webhook not received | URL incorrect, firewall | Verify URL, check firewall rules |
| Connection timeout | Network issues, ERP down | Check network, verify ERP status |

### Debug Mode

Enable debug logging for troubleshooting:

```typescript
// Enable debug logging
process.env.LOG_LEVEL = 'debug';

// Debug integration
await syncFromAPI('netsuite', 'products', {
  debug: true,
  logLevel: 'verbose',
  dryRun: true
});
```

## Best Practices

### 1. Start Small

- Begin with a single entity (e.g., products)
- Test with small dataset
- Validate before scaling

### 2. Use Incremental Sync

- Track last sync timestamp
- Only fetch changed records
- Reduces load on both systems

### 3. Implement Idempotency

- Ensure duplicate imports don't create duplicates
- Use unique identifiers from source ERP
- Implement upsert operations

### 4. Monitor Performance

- Track sync duration
- Monitor error rates
- Set up alerts for failures

### 5. Document Everything

- Document integration configuration
- Record mapping rules
- Maintain change log

## Appendix

### A. ERP Field Mapping Reference

| Target Field | Tally | SAP | NetSuite | Zoho | QuickBooks |
|--------------|-------|-----|----------|------|------------|
| product_id | NAME | Product | internalId | item_id | Id |
| product_name | NAME | ProductDescription | displayName | name | Name |
| sku | - | ProductOldID | itemId | sku | Sku |
| category | PARENT | ProductGroup | itemType | item_type | Type |
| unit | BASEUNITS | BaseUnit | purchaseUnit | unit | Unit |
| price | - | BasePrice | basePrice | rate | UnitPrice |

### B. Sample Mapping Templates

```json
{
  "template_id": "tpl_tally_products_v1",
  "template_name": "Tally Products Mapping",
  "source_system": "tally",
  "target_entity": "products",
  "field_mappings": [
    {
      "source_field": "NAME",
      "target_field": "name",
      "transformation": "trim"
    },
    {
      "source_field": "PARENT",
      "target_field": "category",
      "transformation": "lookup",
      "lookup_table": "categories"
    },
    {
      "source_field": "BASEUNITS",
      "target_field": "unit",
      "transformation": "enum",
      "enum_mapping": {
        "Nos": "PCS",
        "Kg": "KG",
        "Ltr": "LTR"
      }
    }
  ]
}
```

### C. API Rate Limits Reference

| ERP System | Rate Limit | Burst Limit | Reset Period |
|------------|------------|-------------|--------------|
| SAP S/4HANA | 100,000 calls/day | 10 calls/sec | Daily |
| NetSuite | 5,000 calls/month | 10 calls/sec | Monthly |
| Zoho Books | 100 calls/day (free) | 10 calls/min | Daily |
| QuickBooks | 500 calls/min | 500 calls/min | Rolling |
| Odoo | No limit | No limit | - |
| ERPNext | 1,000 calls/hour | 100 calls/min | Hourly |
| Dynamics 365 | 60 calls/min | 60 calls/min | Minute |
| Sage X3 | Varies by license | Varies | - |
| SAP B1 | Varies by license | Varies | - |

### D. Contact Information

For integration support:
- Email: integrations@erpsystem.com
- Documentation: https://docs.erpsystem.com/integrations
- API Status: https://status.erpsystem.com

---

**Document Version:** 1.0  
**Last Updated:** 2025-01-13  
**Maintained By:** ERP Integration Team
