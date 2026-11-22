import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { z } from 'zod';
import { db } from '../lib/firebase';
import {
  dispatchAdminPortalAction,
  isPasswordAdminSessionActive,
  subscribePasswordAdminBundle,
} from '../lib/adminSessionToken';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';
import type { AdminProfile, BatchCategory, BatchRecord } from '../types/domain';

export const BATCH_CATEGORY_VALUES = [
  'upsc',
  'bpsc',
  'railway',
  'banking',
  'ssc',
  'state_psc',
  'defence',
  'teaching',
  'neet_jee',
  'ca_commerce',
  'law_judiciary',
  'it_tech',
  'college_school',
  'general',
  'other',
] as const;

export const batchFormSchema = z.object({
  name: z.string().trim().min(2, 'Batch name must be at least 2 characters.').max(100),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, 'Batch code must be at least 2 characters.')
    .max(30)
    .regex(/^[A-Z0-9_\-]+$/, 'Batch code may only contain uppercase letters, numbers, hyphens, and underscores.'),
  category: z.enum(BATCH_CATEGORY_VALUES),
  targetExam: z.string().trim().max(120).optional().default(''),
  description: z.string().trim().max(400).optional().default(''),
  active: z.boolean().default(true),
});

export type BatchFormInput = z.infer<typeof batchFormSchema>;

export const STARTER_BATCHES: BatchFormInput[] = [
  {
    name: 'UPSC Civil Services (IAS / IPS)',
    code: 'UPSC-CSE',
    category: 'upsc',
    targetExam: 'UPSC Prelims, Mains & Interview',
    description: 'Dedicated silent reading cohort for UPSC Civil Services aspirants with long-hour study discipline.',
    active: true,
  },
  {
    name: 'BPSC Combined Competitive (CCE)',
    code: 'BPSC-CCE',
    category: 'bpsc',
    targetExam: 'BPSC Prelims & Mains',
    description: 'Focused preparation batch for Bihar Public Service Commission and Bihar state civil services.',
    active: true,
  },
  {
    name: 'Railway Exam Prep (RRB NTPC / Group D / ALP)',
    code: 'RRB-RAIL',
    category: 'railway',
    targetExam: 'RRB NTPC, Group D, ALP, Technician & RPF',
    description: 'Daily practice and mock-test cohort for Indian Railways recruitment examinations.',
    active: true,
  },
  {
    name: 'Banking & Insurance (IBPS / SBI / RBI)',
    code: 'BANK-PO',
    category: 'banking',
    targetExam: 'IBPS PO/Clerk, SBI PO, RBI Grade B, LIC',
    description: 'Speed-test and quantitative aptitude study batch for banking and insurance exams.',
    active: true,
  },
  {
    name: 'SSC CGL / CHSL / GD / CPO',
    code: 'SSC-CGL',
    category: 'ssc',
    targetExam: 'SSC CGL, CHSL, CPO, MTS & Stenographer',
    description: 'Structured study cohort for Staff Selection Commission Tier-1 and Tier-2 preparation.',
    active: true,
  },
  {
    name: 'State PSC (KPSC / UPPSC / MPPSC / RPSC)',
    code: 'STATE-PSC',
    category: 'state_psc',
    targetExam: 'KPSC KAS, UPPSC, MPPSC & State Services',
    description: 'Preparation batch for Karnataka PSC and other State Public Service Commission exams.',
    active: true,
  },
  {
    name: 'Defence & Police (NDA / CDS / AFCAT / SI)',
    code: 'DEF-NDA',
    category: 'defence',
    targetExam: 'NDA, CDS, AFCAT, CAPF & Police SI',
    description: 'Disciplined preparation cohort for Armed Forces, CAPF, and State Police recruitment.',
    active: true,
  },
  {
    name: 'Teaching & Education (CTET / TET / UGC NET)',
    code: 'TEACH-NET',
    category: 'teaching',
    targetExam: 'CTET, STET, KVS, DSSSB & UGC NET/JRF',
    description: 'Study group for aspiring teachers, lecturers, and UGC NET / JRF researchers.',
    active: true,
  },
  {
    name: 'NEET UG / PG Medical Entrance',
    code: 'NEET-MED',
    category: 'neet_jee',
    targetExam: 'NEET UG, NEET PG, AIIMS & INI-CET',
    description: 'Intensive NCERT mastery and mock-test cohort for medical entrance aspirants.',
    active: true,
  },
  {
    name: 'IIT-JEE Main & Advanced / KCET',
    code: 'JEE-ENG',
    category: 'neet_jee',
    targetExam: 'JEE Main, JEE Advanced, BITSAT & KCET',
    description: 'Problem-solving cohort for Physics, Chemistry, and Mathematics engineering entrances.',
    active: true,
  },
  {
    name: 'CA / CS / CMA & MBA (CAT / XAT)',
    code: 'CA-MBA',
    category: 'ca_commerce',
    targetExam: 'CA Inter/Final, CS, CMA, CAT & XAT',
    description: 'Quiet desk cohort for Chartered Accountancy, Company Secretary, and MBA aspirants.',
    active: true,
  },
  {
    name: 'Law, CLAT & Judiciary Prep',
    code: 'LAW-JUD',
    category: 'law_judiciary',
    targetExam: 'CLAT, AILET, Judicial Services & APO',
    description: 'Reading-intensive batch for law entrance and State Judicial Services examinations.',
    active: true,
  },
  {
    name: 'IT, GATE, Coding & Tech Interviews',
    code: 'TECH-GATE',
    category: 'it_tech',
    targetExam: 'GATE CS/ECE, DSA, System Design & Cloud Certs',
    description: 'Electronic City engineers and students preparing for GATE, DSA, and software interviews.',
    active: true,
  },
  {
    name: 'College / University Degree & Board Exams',
    code: 'DEGREE-STD',
    category: 'college_school',
    targetExam: 'B.Tech, B.Sc, B.Com, BA, Class 11 & 12 Boards',
    description: 'Semester exam, project, and board exam self-study cohort for school and college students.',
    active: true,
  },
  {
    name: 'General Competitive & Self-Study',
    code: 'GEN-STUDY',
    category: 'general',
    targetExam: 'Self-Paced Reading & Research',
    description: 'Flexible silent reading cohort for independent learners and multi-exam aspirants.',
    active: true,
  },
];

export interface CourseOptionItem {
  id: string;
  name: string;
  code: string;
  category: BatchCategory;
  targetExam: string;
  isFromFirestore: boolean;
}

export const DEFAULT_COURSE_OPTIONS: CourseOptionItem[] = STARTER_BATCHES.map((b) => ({
  id: `catalog_${b.code.toLowerCase()}`,
  name: b.name,
  code: b.code,
  category: b.category,
  targetExam: b.targetExam || '',
  isFromFirestore: false,
}));

export function mergeBatchCourseOptions(
  firestoreBatches: Array<{
    id: string;
    name: string;
    code: string;
    category: string;
    targetExam?: string;
    active: boolean;
  }>,
): CourseOptionItem[] {
  const activeCustom: CourseOptionItem[] = firestoreBatches
    .filter((b) => b.active !== false)
    .map((b) => ({
      id: b.id,
      name: b.name,
      code: b.code,
      category: (b.category as BatchCategory) || 'general',
      targetExam: b.targetExam || '',
      isFromFirestore: true,
    }));

  const seenCodes = new Set(activeCustom.map((b) => b.code.toUpperCase()));
  const seenNames = new Set(activeCustom.map((b) => b.name.toLowerCase()));

  const merged = [...activeCustom];
  for (const fallback of DEFAULT_COURSE_OPTIONS) {
    if (seenCodes.has(fallback.code.toUpperCase()) || seenNames.has(fallback.name.toLowerCase())) {
      continue;
    }
    merged.push(fallback);
  }
  return merged;
}

async function appendBatchAudit(
  actor: AdminProfile,
  action: string,
  resourceId: string,
  summary: string,
): Promise<void> {
  if (isPasswordAdminSessionActive()) return;
  try {
    await addDoc(collection(db, 'audit_logs'), {
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: action.slice(0, 80),
      resourceType: 'batches',
      resourceId: resourceId.slice(0, 128),
      summary: summary.slice(0, 400),
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'audit_logs');
  }
}

export function subscribeBatches(onData: (batches: BatchRecord[]) => void): Unsubscribe {
  if (isPasswordAdminSessionActive()) {
    return subscribePasswordAdminBundle((bundle) => {
      onData(bundle.batches || []);
    });
  }
  const q = query(collection(db, 'batches'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: BatchRecord[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<BatchRecord, 'id'>),
      }));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'batches');
    },
  );
}

export async function createBatchRecord(
  rawInput: BatchFormInput,
  actor: AdminProfile,
): Promise<{ id: string }> {
  const parsed = batchFormSchema.parse(rawInput);

  if (isPasswordAdminSessionActive()) {
    const rec = await dispatchAdminPortalAction('admin_batch_upsert', {
      name: parsed.name,
      code: parsed.code,
      category: parsed.category,
      targetExam: parsed.targetExam || '',
      description: parsed.description || '',
      active: parsed.active,
    });
    return { id: String(rec.id || `bat_${Date.now()}`) };
  }

  try {
    const ref = await addDoc(collection(db, 'batches'), {
      name: parsed.name,
      code: parsed.code,
      category: parsed.category as BatchCategory,
      targetExam: parsed.targetExam || '',
      description: parsed.description || '',
      active: parsed.active,
      createdBy: actor.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await appendBatchAudit(
      actor,
      'CREATE_BATCH',
      ref.id,
      `Created exam batch "${parsed.name}" (${parsed.code}).`,
    );

    return { id: ref.id };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'batches');
  }
}

export async function updateBatchRecord(
  batchId: string,
  rawInput: BatchFormInput,
  actor: AdminProfile,
): Promise<void> {
  const parsed = batchFormSchema.parse(rawInput);

  if (isPasswordAdminSessionActive()) {
    await dispatchAdminPortalAction('admin_batch_upsert', {
      id: batchId,
      name: parsed.name,
      code: parsed.code,
      category: parsed.category,
      targetExam: parsed.targetExam || '',
      description: parsed.description || '',
      active: parsed.active,
    });
    return;
  }

  try {
    await updateDoc(doc(db, 'batches', batchId), {
      name: parsed.name,
      code: parsed.code,
      category: parsed.category as BatchCategory,
      targetExam: parsed.targetExam || '',
      description: parsed.description || '',
      active: parsed.active,
      updatedAt: serverTimestamp(),
    });

    await appendBatchAudit(
      actor,
      'UPDATE_BATCH',
      batchId,
      `Updated batch "${parsed.name}" (${parsed.code}, active=${parsed.active}).`,
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `batches/${batchId}`);
  }
}

export async function toggleBatchActiveStatus(
  batch: BatchRecord,
  actor: AdminProfile,
): Promise<void> {
  const nextActive = !batch.active;
  if (isPasswordAdminSessionActive()) {
    await dispatchAdminPortalAction('admin_batch_upsert', {
      id: batch.id,
      name: batch.name,
      code: batch.code,
      category: batch.category,
      targetExam: batch.targetExam || '',
      description: batch.description || '',
      active: nextActive,
    });
    return;
  }
  try {
    await updateDoc(doc(db, 'batches', batch.id), {
      active: nextActive,
      updatedAt: serverTimestamp(),
    });
    await appendBatchAudit(
      actor,
      'TOGGLE_BATCH_STATUS',
      batch.id,
      `${nextActive ? 'Activated' : 'Archived'} batch "${batch.name}" (${batch.code}).`,
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `batches/${batch.id}`);
  }
}

export async function deleteBatchRecord(batch: BatchRecord, actor: AdminProfile): Promise<void> {
  try {
    await deleteDoc(doc(db, 'batches', batch.id));
    await appendBatchAudit(
      actor,
      'DELETE_BATCH',
      batch.id,
      `Deleted exam batch "${batch.name}" (${batch.code}).`,
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `batches/${batch.id}`);
  }
}

export async function seedStarterBatches(
  existingBatches: BatchRecord[],
  actor: AdminProfile,
): Promise<number> {
  const existingCodes = new Set(existingBatches.map((b) => b.code.toUpperCase()));
  let created = 0;
  for (const starter of STARTER_BATCHES) {
    if (existingCodes.has(starter.code.toUpperCase())) continue;
    await createBatchRecord(starter, actor);
    created += 1;
  }
  return created;
}
