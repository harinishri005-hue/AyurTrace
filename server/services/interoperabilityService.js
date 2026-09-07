const { normalizePrakriti } = require('./prakritiService');
// server/services/interoperabilityService.js - FHIR R4 JSON and CDISC ODM-XML Proof-of-Concept Exporters

/**
 * Generates a FHIR R4 Bundle (JSON) for a given patient.
 * @param {Object} patient - Patient DB record
 * @param {Object} trial - Linked Trial DB record (optional)
 * @returns {Object} FHIR R4 Bundle
 */
function exportPatientToFHIR(patient, trial = null) {
  const timestamp = new Date().toISOString();
  const patientIdStr = `patient-${patient.id}`;

  const entries = [];

  // 1. FHIR Patient Resource
  const fhirPatient = {
    fullUrl: `urn:uuid:${patientIdStr}`,
    resource: {
      resourceType: 'Patient',
      id: patientIdStr,
      identifier: [
        {
          use: 'usual',
          system: 'http://aiia.gov.in/ctms/patient-id',
          value: patient.patient_id
        },
        {
          use: 'secondary',
          system: 'http://aiia.gov.in/ctms/study-id',
          value: patient.study_id
        }
      ],
      active: true,
      gender: patient.gender ? patient.gender.toLowerCase() : 'unknown',
      extension: [
        {
          url: 'http://aiia.gov.in/fhir/StructureDefinition/patient-age',
          valueInteger: patient.age
        }
      ]
    }
  };
  entries.push(fhirPatient);

  // 2. Vitals Observations with LOINC codes
  if (patient.systolic_bp != null) {
    entries.push({
      fullUrl: `urn:uuid:obs-bp-${patient.id}`,
      resource: {
        resourceType: 'Observation',
        id: `obs-bp-${patient.id}`,
        status: 'final',
        category: [{
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            code: 'vital-signs',
            display: 'Vital Signs'
          }]
        }],
        code: {
          coding: [{
            system: 'http://loinc.org',
            code: '8480-6',
            display: 'Systolic blood pressure'
          }]
        },
        subject: { reference: `urn:uuid:${patientIdStr}` },
        effectiveDateTime: patient.visit_date || timestamp,
        valueQuantity: {
          value: patient.systolic_bp,
          unit: 'mmHg',
          system: 'http://unitsofmeasure.org',
          code: 'mm[Hg]'
        }
      }
    });
  }

  if (patient.pulse_rate != null) {
    entries.push({
      fullUrl: `urn:uuid:obs-pulse-${patient.id}`,
      resource: {
        resourceType: 'Observation',
        id: `obs-pulse-${patient.id}`,
        status: 'final',
        category: [{
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            code: 'vital-signs',
            display: 'Vital Signs'
          }]
        }],
        code: {
          coding: [{
            system: 'http://loinc.org',
            code: '8867-4',
            display: 'Heart rate'
          }]
        },
        subject: { reference: `urn:uuid:${patientIdStr}` },
        effectiveDateTime: patient.visit_date || timestamp,
        valueQuantity: {
          value: patient.pulse_rate,
          unit: 'beats/minute',
          system: 'http://unitsofmeasure.org',
          code: '/min'
        }
      }
    });
  }

  if (patient.temperature != null) {
    entries.push({
      fullUrl: `urn:uuid:obs-temp-${patient.id}`,
      resource: {
        resourceType: 'Observation',
        id: `obs-temp-${patient.id}`,
        status: 'final',
        category: [{
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            code: 'vital-signs',
            display: 'Vital Signs'
          }]
        }],
        code: {
          coding: [{
            system: 'http://loinc.org',
            code: '8310-5',
            display: 'Body temperature'
          }]
        },
        subject: { reference: `urn:uuid:${patientIdStr}` },
        effectiveDateTime: patient.visit_date || timestamp,
        valueQuantity: {
          value: patient.temperature,
          unit: 'Cel',
          system: 'http://unitsofmeasure.org',
          code: 'Cel'
        }
      }
    });
  }

  // 3. Ayurvedic Assessment Observation (Prakriti, Agni, Koshtha, Nadi)
  entries.push({
    fullUrl: `urn:uuid:obs-ayurveda-${patient.id}`,
    resource: {
      resourceType: 'Observation',
      id: `obs-ayurveda-${patient.id}`,
      status: 'final',
      code: {
        coding: [{
          system: 'http://aiia.gov.in/ayurveda/terms',
          code: 'NIDANA-PANCHAKA',
          display: 'Ayurvedic Clinical Assessment & Prakriti'
        }]
      },
      subject: { reference: `urn:uuid:${patientIdStr}` },
      effectiveDateTime: patient.visit_date || timestamp,
      component: [
        {
          code: { coding: [{ system: 'http://aiia.gov.in/ayurveda/prakriti', code: 'VATA', display: 'Prakriti Vata %' }] },
          valueQuantity: { value: (normalizePrakriti(patient.prakriti_vata, patient.prakriti_pitta, patient.prakriti_kapha).normalized?.vataPct ?? patient.prakriti_vata), unit: '%' }
        },
        {
          code: { coding: [{ system: 'http://aiia.gov.in/ayurveda/prakriti', code: 'PITTA', display: 'Prakriti Pitta %' }] },
          valueQuantity: { value: (normalizePrakriti(patient.prakriti_vata, patient.prakriti_pitta, patient.prakriti_kapha).normalized?.pittaPct ?? patient.prakriti_pitta), unit: '%' }
        },
        {
          code: { coding: [{ system: 'http://aiia.gov.in/ayurveda/prakriti', code: 'KAPHA', display: 'Prakriti Kapha %' }] },
          valueQuantity: { value: (normalizePrakriti(patient.prakriti_vata, patient.prakriti_pitta, patient.prakriti_kapha).normalized?.kaphaPct ?? patient.prakriti_kapha), unit: '%' }
        },
        {
          code: { coding: [{ system: 'http://aiia.gov.in/ayurveda/terms', code: 'AGNI', display: 'Agni (Digestive Capacity)' }] },
          valueString: patient.agni || 'Not assessed'
        },
        {
          code: { coding: [{ system: 'http://aiia.gov.in/ayurveda/terms', code: 'KOSHTHA', display: 'Koshtha (Bowel Habit)' }] },
          valueString: patient.koshtha || 'Not assessed'
        },
        {
          code: { coding: [{ system: 'http://aiia.gov.in/ayurveda/terms', code: 'NADI', display: 'Nadi Pariksha Note' }] },
          valueString: patient.nadi_note || 'None'
        }
      ]
    }
  });

  // 4. Condition (Ayurvedic Diagnosis - Vyadhi)
  if (patient.ayurvedic_diagnosis) {
    entries.push({
      fullUrl: `urn:uuid:cond-${patient.id}`,
      resource: {
        resourceType: 'Condition',
        id: `cond-${patient.id}`,
        clinicalStatus: {
          coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }]
        },
        code: {
          text: patient.ayurvedic_diagnosis
        },
        subject: { reference: `urn:uuid:${patientIdStr}` },
        recordedDate: patient.enroll_date || timestamp
      }
    });
  }

  // 5. CarePlan (Chikitsa Regimen)
  if (patient.chikitsa) {
    entries.push({
      fullUrl: `urn:uuid:plan-${patient.id}`,
      resource: {
        resourceType: 'CarePlan',
        id: `plan-${patient.id}`,
        status: 'active',
        intent: 'plan',
        title: 'Ayurvedic Chikitsa / Treatment Protocol',
        description: patient.chikitsa,
        subject: { reference: `urn:uuid:${patientIdStr}` }
      }
    });
  }

  // 6. ResearchStudy (Trial linkage)
  if (trial) {
    entries.push({
      fullUrl: `urn:uuid:study-${trial.id}`,
      resource: {
        resourceType: 'ResearchStudy',
        id: `study-${trial.id}`,
        title: trial.title,
        identifier: [
          { system: 'http://ctri.nic.in', value: trial.ctri_number || 'Pending' },
          { system: 'http://cdsco.gov.in/ndct', value: trial.ndct_registration_no || 'Pending' }
        ],
        status: trial.ethics_approval_status === 'Approved' ? 'active' : 'draft'
      }
    });
  }

  return {
    resourceType: 'Bundle',
    id: `aiia-bundle-patient-${patient.id}`,
    meta: {
      lastUpdated: timestamp,
      profile: ['http://hl7.org/fhir/StructureDefinition/Bundle']
    },
    type: 'collection',
    total: entries.length,
    entry: entries
  };
}

/**
 * Generates a full FHIR R4 Bundle for an entire trial and all its enrolled patients.
 */
function exportTrialToFHIR(trial, patients) {
  const timestamp = new Date().toISOString();
  const entries = [];

  // ResearchStudy Resource
  entries.push({
    fullUrl: `urn:uuid:study-${trial.id}`,
    resource: {
      resourceType: 'ResearchStudy',
      id: `study-${trial.id}`,
      title: trial.title,
      identifier: [
        { system: 'http://aiia.gov.in/ctms/study-id', value: trial.study_id },
        { system: 'http://ctri.nic.in', value: trial.ctri_number || 'N/A' },
        { system: 'http://cdsco.gov.in/ndct', value: trial.ndct_registration_no || 'N/A' },
        { system: 'http://aiia.gov.in/ethics', value: trial.ethics_committee_no || 'N/A' }
      ],
      phase: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/research-study-phase', code: trial.phase || 'phase-2' }]
      },
      status: trial.ethics_approval_status === 'Approved' ? 'active' : 'draft'
    }
  });

  // Patients & linked resources
  for (const p of patients) {
    const pBundle = exportPatientToFHIR(p, trial);
    for (const ent of pBundle.entry) {
      if (ent.resource.resourceType !== 'ResearchStudy') {
        entries.push(ent);
      }
    }
  }

  return {
    resourceType: 'Bundle',
    id: `aiia-bundle-trial-${trial.id}`,
    meta: {
      lastUpdated: timestamp,
      profile: ['http://hl7.org/fhir/StructureDefinition/Bundle']
    },
    type: 'collection',
    total: entries.length,
    entry: entries
  };
}

/**
 * Helper to escape XML special characters
 */
function escapeXml(unsafe) {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates CDISC ODM-XML (Operational Data Model v1.3.2) proof-of-concept representation.
 */
function exportToCDISCODM(studyData, patientList) {
  const timestamp = new Date().toISOString();
  const studyOID = `STD.${studyData ? escapeXml(studyData.study_id) : 'AIIA-STUDY-01'}`;
  const studyName = escapeXml(studyData ? studyData.title : 'AIIA Ayurveda Clinical Research');

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<ODM xmlns="http://www.cdisc.org/ns/odm/v1.3"
     xmlns:xs="http://www.w3.org/2001/XMLSchema"
     xmlns:aiia="http://aiia.gov.in/odm/extensions"
     FileType="Snapshot"
     FileOID="ODM.AIIA.${Date.now()}"
     CreationDateTime="${timestamp}"
     ODMVersion="1.3.2">
  <Study OID="${studyOID}">
    <GlobalVariables>
      <StudyName>${studyName}</StudyName>
      <StudyDescription>Ayurveda GCP-aligned clinical trial managed via AyurTrace</StudyDescription>
      <ProtocolName>${studyData ? escapeXml(studyData.study_id) : 'AIIA-PROTOCOL'}</ProtocolName>
    </GlobalVariables>
    <MetaDataVersion OID="MDV.001" Name="AIIA Clinical Data Model v1">
      <ItemGroupDef OID="IG.DEMO" Name="Demographics" Repeating="No">
        <ItemRef ItemOID="IT.PATIENTID" Mandatory="Yes"/>
        <ItemRef ItemOID="IT.GENDER" Mandatory="Yes"/>
        <ItemRef ItemOID="IT.AGE" Mandatory="Yes"/>
      </ItemGroupDef>
      <ItemGroupDef OID="IG.VITALS" Name="Vital Signs" Repeating="Yes">
        <ItemRef ItemOID="IT.SYSBP" Mandatory="No"/>
        <ItemRef ItemOID="IT.PULSE" Mandatory="No"/>
        <ItemRef ItemOID="IT.TEMP" Mandatory="No"/>
      </ItemGroupDef>
      <ItemGroupDef OID="IG.AYURVEDA" Name="Ayurvedic Parameters" Repeating="No">
        <ItemRef ItemOID="IT.PRAKRITI_V" Mandatory="No"/>
        <ItemRef ItemOID="IT.PRAKRITI_P" Mandatory="No"/>
        <ItemRef ItemOID="IT.PRAKRITI_K" Mandatory="No"/>
        <ItemRef ItemOID="IT.AGNI" Mandatory="No"/>
        <ItemRef ItemOID="IT.KOSHTHA" Mandatory="No"/>
        <ItemRef ItemOID="IT.DIAGNOSIS" Mandatory="No"/>
        <ItemRef ItemOID="IT.CHIKITSA" Mandatory="No"/>
      </ItemGroupDef>
    </MetaDataVersion>
  </Study>
  <ClinicalData StudyOID="${studyOID}" MetaDataVersionOID="MDV.001">`;

  for (const p of patientList) {
    xml += `
    <SubjectData SubjectKey="${escapeXml(p.patient_id)}">
      <StudyEventData StudyEventOID="SE.BASELINE">
        <FormData FormOID="FRM.CLINICAL">
          <ItemGroupData ItemGroupOID="IG.DEMO">
            <ItemData ItemOID="IT.PATIENTID" Value="${escapeXml(p.patient_id)}"/>
            <ItemData ItemOID="IT.GENDER" Value="${escapeXml(p.gender)}"/>
            <ItemData ItemOID="IT.AGE" Value="${escapeXml(p.age)}"/>
          </ItemGroupData>
          <ItemGroupData ItemGroupOID="IG.VITALS">
            <ItemData ItemOID="IT.SYSBP" Value="${escapeXml(p.systolic_bp)}"/>
            <ItemData ItemOID="IT.PULSE" Value="${escapeXml(p.pulse_rate)}"/>
            <ItemData ItemOID="IT.TEMP" Value="${escapeXml(p.temperature)}"/>
          </ItemGroupData>
          <ItemGroupData ItemGroupOID="IG.AYURVEDA">
            <ItemData ItemOID="IT.PRAKRITI_V" Value="${escapeXml(normalizePrakriti(p.prakriti_vata, p.prakriti_pitta, p.prakriti_kapha).normalized?.vataPct ?? p.prakriti_vata)}"/>
            <ItemData ItemOID="IT.PRAKRITI_P" Value="${escapeXml(normalizePrakriti(p.prakriti_vata, p.prakriti_pitta, p.prakriti_kapha).normalized?.pittaPct ?? p.prakriti_pitta)}"/>
            <ItemData ItemOID="IT.PRAKRITI_K" Value="${escapeXml(normalizePrakriti(p.prakriti_vata, p.prakriti_pitta, p.prakriti_kapha).normalized?.kaphaPct ?? p.prakriti_kapha)}"/>
            <ItemData ItemOID="IT.AGNI" Value="${escapeXml(p.agni)}"/>
            <ItemData ItemOID="IT.KOSHTHA" Value="${escapeXml(p.koshtha)}"/>
            <ItemData ItemOID="IT.DIAGNOSIS" Value="${escapeXml(p.ayurvedic_diagnosis)}"/>
            <ItemData ItemOID="IT.CHIKITSA" Value="${escapeXml(p.chikitsa)}"/>
          </ItemGroupData>
        </FormData>
      </StudyEventData>
    </SubjectData>`;
  }

  xml += `
  </ClinicalData>
</ODM>`;

  return xml;
}

module.exports = {
  exportPatientToFHIR,
  exportTrialToFHIR,
  exportToCDISCODM
};
