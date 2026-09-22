import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { measurementTimeLayout } from '../lib/physician/measurement-chart-layout';
import { TRICHOSCOPY_AR, trichoscopyLabel } from '../lib/physician/trichoscopy-presentation';
import { PHYSICIAN_TRICHOSCOPY_FINDINGS } from '../lib/physician/visit-clinical-contracts';
import { buildPreFinalizeReview, presentDecisionDetails, hasIncompleteAnatomicalRegion } from '../lib/physician/visit-workspace';
import { hasCurrentScalpConcern, physicianClinicalWorkspaceKind, physicianWorkspaceSectionProfile } from '../lib/physician/workspace-flow';
import { presentClinicalValue } from '../lib/physician/presentation';
import type { PhysicianInterviewQuestion } from '../lib/physician/types';

const emptyState = {diagnoses:[],treatmentCourses:[],procedurePlans:[],performedProcedures:[]};

test('UX chart centers a single instant and deduplicates equivalent timestamp formats', () => {
  const layout = measurementTimeLayout(['2026-09-06T10:00:00Z','2026-09-06T13:00:00+03:00']);
  assert.equal(layout.ticks.length, 1);
  assert.equal(layout.x(layout.ticks[0]), 475);
});

test('UX clustered chart dates preserve endpoints without overlapping labels or mutating dates', () => {
  const dates = ['2026-01-01','2026-01-02','2026-01-03','2026-07-01','2026-12-31'];
  const original = [...dates];
  const {ticks,x}=measurementTimeLayout(dates);
  assert.equal(ticks[0],Date.parse(dates[0]));
  assert.equal(ticks.at(-1),Date.parse(dates.at(-1)!));
  for(let i=1;i<ticks.length;i++) assert.ok(x(ticks[i])-x(ticks[i-1])>=160);
  assert.deepEqual(dates,original);
  assert.deepEqual(measurementTimeLayout(['invalid']).ticks,[]);
});

test('UX every approved structured Trichoscopy finding localizes without touching authored text', () => {
  for(const finding of PHYSICIAN_TRICHOSCOPY_FINDINGS) {
    assert.match(trichoscopyLabel(finding.label,'ar'),/[\u0600-\u06ff]/);
    assert.equal(trichoscopyLabel(finding.label,'en'),finding.label);
    assert.equal(trichoscopyLabel(finding.label,'ar'),TRICHOSCOPY_AR[finding.code]);
  }
  assert.equal(trichoscopyLabel('Authored observation — ملاحظة','ar'),'Authored observation — ملاحظة');
});

test('UX review includes regimen, physician note, dates and authoritative OTHER text', () => {
  const sections={TREATMENT_PROCEDURES:{treatments:[{action:'START',name:'Plan',regimenText:'Regimen content',noteText:'Authored note'}],procedures:[{action:'PLAN',procedureCode:'OTHER',otherProcedureText:'Exact other procedure',plannedDate:'2026-09-10',noteText:'Procedure note'}]}};
  for(const locale of ['ar','en'] as const) {
    const review=JSON.stringify(buildPreFinalizeReview(sections,emptyState,locale,TRICHOSCOPY_AR));
    for(const text of ['Regimen content','Authored note','Exact other procedure','Procedure note']) assert.ok(review.includes(text));
    assert.equal(presentDecisionDetails({action:'PERFORM',performedDate:'2026-09-06'},locale).length,1);
  }
});

test('UX scalp-biopsy history does not activate a current scalp workspace', () => {
  assert.equal(hasCurrentScalpConcern([{code:'Q_SCALP_BIOPSY_GATE',value:'YES'}]),false);
  assert.equal(hasCurrentScalpConcern([{code:'Q_SCALP_SYMPTOMS',value:['ITCH']},{code:'Q_SECONDARY_SCALP_GATE',value:'NO'}]),false);
  assert.equal(hasCurrentScalpConcern([{code:'Q_SECONDARY_SCALP_GATE',value:'YES'}]),true);
  assert.equal(hasCurrentScalpConcern([{code:'Q_SCALP_SYMPTOMS',value:['ITCH']}]),true);
});

test('UX service routing and hair-tool separation cover all requested compositions', () => {
  const cases=[['RV_HAIR_LOSS',undefined,'HAIR'],['RV_HAIR_LOSS','RV_SCALP_SYMPTOMS','HAIR_SCALP'],['RV_SCALP_SYMPTOMS',undefined,'HAIR_SCALP'],['RV_HAIR_QUALITY',undefined,'HAIR_QUALITY'],['RV_DERMATOLOGY',undefined,'DERMATOLOGY'],['RV_LASER',undefined,'LASER'],['RV_AESTHETIC_PROCEDURES',undefined,'AESTHETIC'],['RV_DERMATOLOGY','RV_LASER','DERMATOLOGY'],['RV_DERMATOLOGY','RV_AESTHETIC_PROCEDURES','DERMATOLOGY']] as const;
  for(const [primary,additional,expected] of cases) {
    const kind=physicianClinicalWorkspaceKind({primaryReasonCode:primary,additionalReasonCodes:additional?[additional]:[]});
    assert.equal(kind,expected);
    assert.equal(physicianWorkspaceSectionProfile(kind).hairScalpAssessment,['HAIR','HAIR_SCALP'].includes(kind));
    assert.equal(physicianWorkspaceSectionProfile(kind).hairProcedureDecisions,['HAIR','HAIR_SCALP'].includes(kind));
  }
});

test('UX authored therapy names survive fixture filtering but internal metadata stays hidden', () => {
  const question: PhysicianInterviewQuestion={id:'q',code:'Q_HAIR_TREATMENT_ITEMS',text:{ar:'علاج',en:'Treatment'},library:{ar:'تاريخ',en:'History'},group:{ar:'تاريخ',en:'History'},responseType:'LONG_TEXT',responseScopeType:'MODULE',responseScopeKey:'HAIR',options:[],value:[],repeatableItems:[{id:'private-fixture-id',synthetic:true,name:'Synthetic scalp lotion',notes:'SYN-authored note',stillUsing:'YES'}],currentSource:'PATIENT',editableByPhysician:true};
  for(const locale of ['ar','en'] as const) {
    const lines=presentClinicalValue(question,locale).lines.join(' ');
    assert.ok(lines.includes('Synthetic scalp lotion'));
    assert.ok(lines.includes('SYN-authored note'));
    assert.ok(!lines.includes('private-fixture-id'));
  }
});

test('UX map identity remains explicitly required independently of presentation layout', () => {
  const region={view:'FRONT',geometry:{version:1,strokes:[{radius:.02,points:[{x:.4,y:.3},{x:.5,y:.4}]}]}};
  assert.equal(hasIncompleteAnatomicalRegion({ANATOMICAL_MAP:{regions:[region]}}),true);
  assert.equal(hasIncompleteAnatomicalRegion({ANATOMICAL_MAP:{regions:[{...region,anatomicalRegionCode:'FRONTAL_SCALP'}]}}),false);
  const source=readFileSync(new URL('../app/physician/patients/[patientId]/physician-visit-workspace.tsx',import.meta.url),'utf8');
  assert.ok(source.includes('group.key !== "ANATOMICAL_MAP"'));
  assert.ok(source.includes('mode="REVIEW"'));
  assert.ok(source.includes('!hasIncompleteAnatomicalRegion(sections)'));
});
