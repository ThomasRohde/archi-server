# Extended ArchiMate Patterns Catalog

Industry-specific and advanced architecture patterns.

## Industry-Specific Patterns

### Financial Services (BIAN Integration)

The Banking Industry Architecture Network (BIAN) maps to ArchiMate:
- **Service Landscape** → ArchiMate Capabilities in value chain structure
- **Business Domains** → Groupings containing Service Domains
- **Service Operations** → Business Services
- **Business Objects** → ISO 20022 standard alignment

**Pattern template:**
```
[Capability: Service Domain Name]
    └── [Business Service: BIAN Service]
        └── [Application Component: Core Banking]
            └── [Technology Service: API]
                └── [Data Object: ISO 20022]
```

**Example - Payment Processing:**
```
[Capability: Payment Execution]
    → [realized by] → [Business Service: Payment Initiation]
        → [realized by] → [Application Service: Payment API]
            → [realized by] → [Application Component: Payment Engine]
                → [access (rw)] → [Data Object: ISO 20022 Payment Message]
```

### Healthcare (HL7/FHIR)

**FHIR integration pattern:**
```
[Application Service: FHIR API]
    → [realized by] → [Application Interface: REST Endpoint]
        → [assigned to] → [Application Component: FHIR Server]
            → [access] → [Data Object: FHIR Resource]
                → [realizes] → [Business Object: Patient Record]
```

**Healthcare data flow:**
```
[Application Component: EHR System]
    → [flow: HL7 Message] → [Application Component: Integration Engine]
        → [flow: FHIR Resource] → [Application Component: Health Information Exchange]
```

**Interoperability pattern:**
```
[Technology Service: HL7 FHIR Server]
    → [serves] → [Application Component: Clinical Application]
[Application Interface: FHIR REST API]
    → [realizes] → [Technology Service: HL7 FHIR Server]
```

### Government (EIRA)

The European Interoperability Reference Architecture extends ArchiMate:
- **Legal View** → Motivation elements
- **Organizational View** → Business Layer
- **Semantic View** → Data Objects
- **Technical View** → Technology Layer

**EIRA Pattern:**
```
# Legal Interoperability
[Requirement: GDPR Compliance]
    → [influences] → [Principle: Data Minimization]

# Organizational Interoperability
[Business Service: Citizen Registration]
    → [served by] → [Business Actor: Government Agency]

# Semantic Interoperability
[Data Object: Citizen Profile]
    → [realizes] → [Business Object: Citizen]

# Technical Interoperability
[Technology Service: API Gateway]
    → [serves] → [Application Service: Citizen Data API]
```

### Regulatory Compliance (GDPR)

**GDPR compliance pattern:**
```
[Driver: Data Subject Rights Compliance]
    → [influences] → [Goal: Enable Data Erasure]
        → [realized by] → [Requirement: Erasure Request Processing]
            → [realized by] → [Business Process: Handle Erasure Request]
                → [served by] → [Application Service: Data Deletion Service]
                    → [access (write)] → [Data Object: Personal Data Record]
```

**Key compliance modeling elements:**
- **Control Objectives** → Requirements
- **Control Activities** → Business Processes
- **Audit Evidence** → Data Objects
- **Monitoring** → Assessment elements

**Data processing pattern:**
```
[Business Role: Data Controller]
    → [assignment] → [Business Process: Process Personal Data]
        → [access (rw)] → [Business Object: Personal Data]

[Principle: Purpose Limitation]
    → [influences] → [Requirement: Data Processing Consent]
        → [realized by] → [Application Service: Consent Management]
```

## Advanced Technical Patterns

### Multi-Tenant SaaS

```
[Application Component: SaaS Platform]
    → [composition] → [Application Component: Tenant Manager]
    → [composition] → [Application Component: Core Application]

[Node: Shared Infrastructure]
    → [serves] → [Application Component: SaaS Platform]

[Data Object: Tenant Configuration]
    → [accessed by] → [Application Component: Tenant Manager]

[Application Service: Tenant API]
    → [serves] → [Business Actor: Tenant Organization]
```

### Data Mesh

```
# Domain-Oriented Ownership
[Business Function: Sales Domain]
    → [assignment] → [Application Component: Sales Data Product]

[Application Component: Sales Data Product]
    → [realizes] → [Application Service: Sales Data API]
    → [access] → [Data Object: Sales Events]

# Self-Serve Data Infrastructure
[Technology Service: Data Platform]
    → [serves] → [Application Component: Sales Data Product]
    → [serves] → [Application Component: Marketing Data Product]

# Federated Governance
[Business Role: Data Product Owner]
    → [assignment] → [Business Process: Manage Data Quality]
```

### Edge Computing

```
[Node: Edge Node]
    → [composition] → [Device: Edge Gateway]
    → [composition] → [System Software: Edge Runtime]

[Application Component: Edge Application]
    → [assigned to] → [Node: Edge Node]
    → [flow: Processed Data] → [Application Component: Cloud Application]

[Technology Service: Edge Orchestration]
    → [serves] → [Application Component: Edge Application]
```

### Blockchain/DLT

```
[Technology Service: Distributed Ledger]
    → [realizes] → [Application Service: Smart Contract Execution]
    → [access (append-only)] → [Artifact: Blockchain Data]

[Application Component: DApp]
    → [served by] → [Technology Service: Distributed Ledger]
    → [realizes] → [Application Service: Decentralized Transaction]

[Business Process: Execute Smart Contract]
    → [served by] → [Application Service: Smart Contract Execution]
```

### AI/ML Pipeline

```
[Application Component: ML Pipeline]
    → [composition] → [Application Function: Data Ingestion]
    → [composition] → [Application Function: Feature Engineering]
    → [composition] → [Application Function: Model Training]
    → [composition] → [Application Function: Model Serving]

[Data Object: Training Data]
    → [accessed by] → [Application Function: Model Training]

[Artifact: ML Model]
    → [realized by] → [Application Function: Model Training]
    → [accessed by] → [Application Function: Model Serving]

[Application Service: Prediction API]
    → [realized by] → [Application Function: Model Serving]
```

## Hybrid Architecture Patterns

### Hybrid Cloud

```
[Location: On-Premises]
    → [contains] → [Node: Private Cloud]

[Location: Public Cloud]
    → [contains] → [Node: AWS/Azure/GCP Region]

[Application Component: Hybrid Application]
    → [served by] → [Technology Service: Private Cloud Compute]
    → [served by] → [Technology Service: Public Cloud Compute]

[Path: Hybrid Connectivity]
    → [connects] → [Node: Private Cloud]
    → [connects] → [Node: Public Cloud Region]
```

### Legacy Integration

```
[Application Component: Legacy System]
    → [realizes] → [Application Service: Legacy Function]

[Application Component: API Wrapper]
    → [served by] → [Application Service: Legacy Function]
    → [realizes] → [Application Service: Modern API]

[Application Component: Modern Application]
    → [served by] → [Application Service: Modern API]

# Strangler Fig Pattern
[Application Component: Facade]
    → [serves] → [Business Process: Business Operation]
    → [served by] → [Application Component: Legacy System]
    → [served by] → [Application Component: New System]
```

### Multi-Speed IT

```
# Speed 1: Stable Core
[Application Component: Core Banking System]
    → [realizes] → [Application Service: Account Management]
    → [assignment] → [Grouping: Systems of Record]

# Speed 2: Differentiation
[Application Component: Digital Banking Platform]
    → [realizes] → [Application Service: Mobile Banking]
    → [served by] → [Application Service: Account Management]
    → [assignment] → [Grouping: Systems of Differentiation]

# Speed 3: Innovation
[Application Component: Innovation Lab Apps]
    → [realizes] → [Application Service: Experimental Features]
    → [assignment] → [Grouping: Systems of Innovation]
```
