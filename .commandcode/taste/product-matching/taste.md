# Product Matching
- Only allow auto-mapping for exact aliases, verified aliases, and deterministic matches; everything else must have needs_review=true. Confidence: 0.90
- Use confidence tiers: 99-100 auto-accept, 90-98 suggested, <90 manual review; semantic-only matches must never exceed 85. Confidence: 0.85
- Normalize product names into structured fields (brand, strength, unit, form) for both invoice and ERP products before matching. Confidence: 0.85
- Apply deterministic filters (strength, form) BEFORE vector/pgvector similarity search, not after. Confidence: 0.85
- Use weighted hybrid scoring for matching: alias exact=40, strength match=25, form match=20, token overlap=10, vector similarity=5. Embeddings assist matching, not dominate it. Confidence: 0.80
- Store explainability data per match: matching_method, vector_similarity, token_overlap, strength_match, etc. Confidence: 0.75
