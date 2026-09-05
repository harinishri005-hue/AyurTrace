# AIIA Clinical Trials Dashboard (Ayurveda CTMS)

> **Institutional Clinical Trial Management System (CTMS) for the All India Institute of Ayurveda (AIIA), New Delhi**  
> *GCP-compliant, NDCT Rules 2019-aligned, pharmacovigilance-ready clinical research platform with automated edit-checks, Ayurvedic Nidana Panchaka intake, protocol deviations tracking, and interoperability exports (HL7 FHIR R4 & CDISC ODM-XML).*

---

## ?? Overview & Core Vision

The **AIIA Clinical Trials Dashboard** is an enterprise-grade Clinical Trial Management System purpose-built for institutional and academic clinical research in traditional Ayurveda medicine. Unlike generic CRUD dashboards, it implements genuine regulatory workflows:

- **Role-Based Access Control (RBAC):** Distinct interfaces and enforced server-side authorization for Principal Investigators, Clinical Research Coordinators, Data Managers, Regulatory Affairs Officers, Ethics Committee Members, and Administrators.
- **Automated Edit-Check Validation Engine:** Real-time data quality algorithms monitoring physiological vitals, clinical boundaries, Ayurvedic Prakriti doshic distribution rules (Vata/Pitta/Kapha percentages), and Serious Adverse Event (SAE) pharmacovigilance escalation.
- **Strict Query Resolution Workflow:** A data query cannot be closed simply by typing a note; the underlying clinical field is re-validated in real-time against regulatory thresholds.
- **Protocol Deviations Management:** Dedicated workflow separate from data queries to track non-compliance events, visit window breaches, and prohibited concomitant medications.
- **Regulatory Audit Trail:** Immutable, timestamped, user-attributed log capturing every data modification, authorization change, and export event (21 CFR Part 11 and GCP aligned).
- **Interoperability-Ready Exports:** Proof-of-concept exports for **HL7 FHIR R4 JSON** (Patient, Observation with LOINC codes, Condition, CarePlan, ResearchStudy) and **CDISC ODM-XML v1.3.2** for national and international clinical data exchange.

---

## ??? System Architecture

```
aiia-ctms/
+-- package.json                 # Project dependencies & npm scripts
+-- .env                         # Server environment configuration
+-- README.md                    # Project documentation & runbook
+-- server/
�   +-- index.js                 # Express application, CORS, rate-limiting & static serving
�   +-- config/
�   �   +-- index.js             # Clinical thresholds, roles, Ayurvedic classifications
�   +-- db/
�   �   +-- index.js             # SQLite connection (WAL mode & PRAGMA foreign keys)
�   �   +-- schema.sql           # Relational schema (7 core tables + indexes)
�   �   +-- seed.js              # Comprehensive Ayurveda clinical demo seeder
�   +-- middleware/
�   �   +-- auth.js              # Bearer JWT verification & context injection
�   �   +-- rbac.js              # Role-Based Access Control middleware
�   +-- services/
�   �   +-- editCheckEngine.js   # Automated edit-check & re-validation engine
�   �   +-- auditService.js      # Centralized GCP audit logger
�   �   +-- excelService.js      # Excel template, batch importer & workbook exporter
�   �   +-- interoperabilityService.js # HL7 FHIR R4 JSON & CDISC ODM-XML generators
�   +-- routes/
�   �   +-- auth.js              # Signup, login, profile, password, admin user management
�   �   +-- ctms.js              # Dashboard metrics, trials, patients, queries, deviations, exports
�   +-- tests/
�       +-- verify.js            # Automated end-to-end integration test suite
+-- client/
    +-- index.html               # Institutional SPA shell with sidebar & utility bar
    +-- style.css                # Deep Indigo & Saffron design system, light/dark modes
    +-- app.js                   # Reactive controller, live SVG charts & modal workflows
```

---

## ?? Quick Start Guide

### Prerequisites
- **Node.js**: v18+ (tested on Node v24 LTS)
- **npm**: v9+

### 1. Installation
Clone or navigate to the project directory:
```bash
cd C:\Users\DELL\.gemini\antigravity\scratch\aiia-ctms
npm install
```

### 2. Database Initialization & Seeding
Populate the database with realistic demo trials, patients, queries, protocol deviations, and audit trails:
```bash
npm run seed
```

### 3. Running the Server
Launch the server:
```bash
npm start
```
The application will be accessible at:
?? **`http://localhost:4000`**

### 4. Running the Automated Test Suite
Execute the 24-point end-to-end test suite:
```bash
npm test
```

---

## ?? Demo User Credentials

The database is pre-seeded with accounts for all institutional roles. The default password for all demo accounts is **`admin123`**:

| Role | Username | Display Name | Permissions & Responsibilities |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin` | Dr. Tanuja Nesari | Full platform oversight, user role administration, ethics status overrides |
| **Principal Investigator** | `pi_vaidya` | Prof. Vaidya K. S. Dhiman | Protocol direction, closes protocol deviations, signs off clinical reviews |
| **Clinical Research Coordinator** | `crc_priya` | Dr. Priya Sharma | Patient enrollment, visit tracking, adverse event intake, Excel batch imports |
| **Data Manager** | `datamgr_arun` | Arun Verma | Data quality monitoring, query review, closes protocol deviations, Excel exports |
| **Ethics Committee Member** | `ethics_drsharma` | Dr. R. K. Manchanda | Institutional Ethics Committee (IEC) approval, status reviews & updates |
| **Regulatory Affairs Officer** | `reg_anita` | Anita Desai | CTRI / NDCT compliance verification, FHIR and CDISC regulatory exports |

---

## ?? Core Clinical & Ayurvedic Modules

### 1. Dashboard
- **Quality Score Index:** Live calculation factoring clean vs. flagged records, active query rates, and open critical safety alerts.
- **SVG Circular Gauges:** Real-time visual donut rings for Quality Score, Clean vs. Flagged distribution, and Open Severity Mix (Critical, Major, Minor).
- **Secondary KPIs:** Missing data rate, duplicate enforcement, open protocol deviations, and onboarding progress checklist.

### 2. Clinical Trials Module
- Tracks **Study ID**, **Protocol Title**, **Phase** (Phase I�IV), **CTRI Number**, **NDCT Registration Number**, and **Institutional Ethics Committee (IEC) Ref No.**
- Distinctive **Ethics Seal Badges** (*Pending*, *Approved*, *Rejected*, *Expired*).
- Status updates restricted to **Ethics Committee Members** and **Admins**.
- One-click export of the entire trial and its enrolled cohort to **FHIR R4 Bundle** or **CDISC ODM-XML**.

### 3. Patient Enrollment & Ayurvedic Intake
- Comprehensive demographic and clinical visit tracking (Screening, Baseline, Follow-up 1�3).
- **Ayurvedic Nidana Panchaka & Dosha Assessment:**
  - **Prakriti Distribution:** Vata, Pitta, Kapha scores (automatically normalized into exact 100% composition percentages).
  - **Agni (Digestive Capacity):** *Sama*, *Manda*, *Tikshna*, *Vishama*.
  - **Koshtha (Bowel Tendency):** *Mridu*, *Madhyama*, *Krura*.
  - **Nadi Pariksha Note:** Pulse examination characteristics (e.g. *Sarpa gati*, *Manduka gati*, *Hamsa gati*).
  - **Ayurvedic Diagnosis (Vyadhi):** Classical disease classification (e.g. *Chittodvega*, *Sandhigata Vata*, *Medoroga*).
  - **Chikitsa Protocol:** Classical herbal/herbo-mineral formulations and dosage instructions.
- **Safety Vitals Monitoring:** Systolic Blood Pressure, Pulse Rate, Body Temperature, Weight, Height.
- **Pharmacovigilance Serious Adverse Event (SAE) Flag:** Generates expedited safety escalation logic.

### 4. Automated Edit-Check Engine
When a patient record is created, edited, or batch-imported from Excel, the rule engine validates:
- Mandatory clinical identifiers (*Patient ID*, *Study ID*, *Site ID*, *Gender*, *Age*).
- **Blood Pressure Bounds:** Normal 90�140 mmHg. Major query if 141�180 or 80�89. Critical query if >180 (hypertensive crisis) or <80 (severe hypotension).
- **Pulse Rate Bounds:** Normal 60�100 bpm. Major query if 101�120 or 50�59. Critical query if >120 (tachycardia) or <50 (bradycardia).
- **Temperature Bounds:** Normal 36.0�37.5 �C. Major query if 37.6�38.5. Critical query if >38.5 (pyrexia) or <35.0 (hypothermia).
- **Prakriti Proportions:** Verifies that Vata + Pitta + Kapha sum to 100% (tolerance �1%).
- **SAE Escalation:** Generates Critical query requiring documented 24-hour expedited pharmacovigilance review (NDCT Rules 2019).

### 5. Queries Module & Re-Validation Gate
- Filter queries by severity (*Critical*, *Major*, *Minor*) and status (*Open*, *Resolved*).
- **Enforced Re-validation:** Resolving a query re-evaluates the patient record. If the underlying data is still invalid, the resolution is rejected with a descriptive clinical error message.
- Once all open queries for a patient reach *Resolved*, the patient record status automatically transitions from **Flagged** to **Clean**.

### 6. Protocol Deviations
- Tracks clinical non-compliance, visit window variances, and prohibited concomitant medications.
- Logged with severity (*Minor*, *Major*, *Critical*).
- Closing deviations is restricted to **Principal Investigators**, **Data Managers**, and **Admins**.

### 7. Excel Batch Import & Export
- **Download Template:** Pre-formatted `.xlsx` file with clinical headers and reference sample rows.
- **Batch Modes:** `new-batch` (creates new tracked container), `merge` (updates matching IDs), `new-only` (skips existing), and `replace` (overwrites).
- Runs automated edit checks on every row during ingestion.
- **Multi-Worksheet Export:** Exports Patients, Trials, Queries, Deviations, and Audit Trail into a consolidated Excel workbook.

### 8. Interoperability Proof-of-Concept Exports
- **HL7 FHIR R4 (JSON):**
  - Exports a `Bundle` of type `collection`.
  - Maps `Patient`, `Observation` (vital signs with LOINC codes: BP `8480-6`, Pulse `8867-4`, Temp `8310-5`), Ayurvedic assessment observations (Prakriti, Agni, Koshtha), `Condition` (Vyadhi), `CarePlan` (Chikitsa), and `ResearchStudy` (Trial protocol).
- **CDISC ODM-XML (v1.3.2):**
  - Standardized XML export with `<Study>`, `<MetaDataVersion>`, `<ClinicalData>`, `<SubjectData>`, and `<ItemGroupData>` tags for clinical trial archiving.

### 9. GCP Audit Trail
- Chronological, attributed log capturing:
  - User registration & login
  - Trial protocol creation & ethics status transitions
  - Patient enrollments & profile edits
  - Query resolutions & re-openings
  - Protocol deviation logging & closures
  - Batch imports and FHIR/CDISC/Excel exports

---

## ?? Security & Compliance Posture

- **Password Hashing:** Passwords hashed with `bcryptjs` using 10 salt rounds.
- **Session Authentication:** Cryptographically signed JWT tokens with 7-day expiration.
- **Rate Limiting:** `express-rate-limit` protects authentication endpoints against brute-force attacks.
- **Input Sanitization & Validation:** All routes validate inputs before persistence; queries and deviations use parameterized prepared statements preventing SQL injection.
- **Regulatory Alignment:** Designed in compliance with Indian Good Clinical Practice (GCP), New Drugs and Clinical Trials (NDCT) Rules 2019, and the Digital Personal Data Protection (DPDP) Act 2023.

---

## ?? License
Developed for academic and clinical research at the All India Institute of Ayurveda (AIIA).
