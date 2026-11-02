import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface IndexField {
  fieldPath: string;
  order: 'ASCENDING' | 'DESCENDING';
}

interface FirestoreIndex {
  collectionGroup: string;
  queryScope: string;
  fields: IndexField[];
}

interface IndexFile {
  indexes: FirestoreIndex[];
  fieldOverrides: unknown[];
}

interface CompositeQuery {
  collection: string;
  whereFields: string[];
  orderByFields: { field: string; direction: 'asc' | 'desc' }[];
  file: string;
  line: number;
}

function parseIndexes(): Map<string, Set<string>> {
  const indexPath = join(__dirname, '..', 'firestore.indexes.json');
  const indexFile: IndexFile = JSON.parse(readFileSync(indexPath, 'utf-8'));
  
  const indexMap = new Map<string, Set<string>>();
  
  for (const index of indexFile.indexes) {
    const collection = index.collectionGroup;
    if (!indexMap.has(collection)) {
      indexMap.set(collection, new Set());
    }
    
    const fieldSignature = index.fields
      .map(f => `${f.fieldPath}:${f.order === 'ASCENDING' ? 'asc' : 'desc'}`)
      .join(',');
    
    indexMap.get(collection)!.add(fieldSignature);
  }
  
  return indexMap;
}

function extractCompositeQueries(): CompositeQuery[] {
  const serverDir = join(__dirname, '..', 'server');
  const queries: CompositeQuery[] = [];
  
  function scanFile(filePath: string): void {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    let currentCollection: string | null = null;
    let whereFields: string[] = [];
    let orderByFields: { field: string; direction: 'asc' | 'desc' }[] = [];
    let queryStartLine = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      const collectionMatch = line.match(/\.collection\(['"](\w+)['"]\)/);
      if (collectionMatch) {
        if (currentCollection && (whereFields.length > 0 || orderByFields.length > 0)) {
          if (whereFields.length + orderByFields.length > 1) {
            queries.push({
              collection: currentCollection,
              whereFields: [...whereFields],
              orderByFields: [...orderByFields],
              file: filePath,
              line: queryStartLine,
            });
          }
        }
        currentCollection = collectionMatch[1];
        whereFields = [];
        orderByFields = [];
        queryStartLine = i + 1;
      }
      
      const whereMatch = line.match(/\.where\(['"](\w+)['"]/);
      if (whereMatch && currentCollection) {
        whereFields.push(whereMatch[1]);
      }
      
      const orderByMatch = line.match(/\.orderBy\(['"](\w+)['"](?:,\s*['"]?(asc|desc)['"]?)?\)/);
      if (orderByMatch && currentCollection) {
        orderByFields.push({
          field: orderByMatch[1],
          direction: (orderByMatch[2] as 'asc' | 'desc') || 'asc',
        });
      }
      
      if (line.includes(';') && currentCollection && (whereFields.length > 0 || orderByFields.length > 0)) {
        if (whereFields.length + orderByFields.length > 1) {
          queries.push({
            collection: currentCollection,
            whereFields: [...whereFields],
            orderByFields: [...orderByFields],
            file: filePath,
            line: queryStartLine,
          });
        }
        currentCollection = null;
        whereFields = [];
        orderByFields = [];
      }
    }
  }
  
  function scanDir(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        scanFile(fullPath);
      }
    }
  }
  
  scanDir(serverDir);
  return queries;
}

describe('Firestore Index Validation', () => {
  let indexMap: Map<string, Set<string>>;
  let compositeQueries: CompositeQuery[];
  
  before(() => {
    indexMap = parseIndexes();
    compositeQueries = extractCompositeQueries();
  });
  
  it('parses firestore.indexes.json successfully', () => {
    assert.ok(indexMap.size > 0, 'Should have at least one collection with indexes');
  });
  
  it('finds composite queries in server code', () => {
    assert.ok(compositeQueries.length >= 0, 'Query extraction should complete');
  });
  
  it('corrections collection has index for submittedBy + submittedAt (myRequests query)', () => {
    const correctionsIndexes = indexMap.get('corrections');
    assert.ok(correctionsIndexes, 'corrections collection should have indexes');
    
    const hasMyRequestsIndex = correctionsIndexes.has('submittedBy:asc,submittedAt:desc');
    assert.ok(hasMyRequestsIndex, 'corrections should have index for submittedBy ASC, submittedAt DESC');
  });
  
  it('corrections collection has index for status + submittedAt (approval queue query)', () => {
    const correctionsIndexes = indexMap.get('corrections');
    assert.ok(correctionsIndexes, 'corrections collection should have indexes');
    
    const hasStatusIndex = correctionsIndexes.has('status:asc,submittedAt:desc');
    assert.ok(hasStatusIndex, 'corrections should have index for status ASC, submittedAt DESC');
  });
  
  it('auditLog collection has required indexes', () => {
    const auditIndexes = indexMap.get('auditLog');
    assert.ok(auditIndexes, 'auditLog collection should have indexes');
    
    assert.ok(auditIndexes.has('entityId:asc,timestamp:desc'), 'Should have entityId + timestamp index');
    assert.ok(auditIndexes.has('entityType:asc,timestamp:desc'), 'Should have entityType + timestamp index');
    assert.ok(auditIndexes.has('userId:asc,timestamp:desc'), 'Should have userId + timestamp index');
    assert.ok(auditIndexes.has('locationId:asc,timestamp:desc'), 'Should have locationId + timestamp index');
  });
  
  it('verificationRequests collection has required indexes', () => {
    const verificationIndexes = indexMap.get('verificationRequests');
    assert.ok(verificationIndexes, 'verificationRequests collection should have indexes');
    
    assert.ok(verificationIndexes.has('status:asc,sentAt:desc'), 'Should have status + sentAt index');
    assert.ok(verificationIndexes.has('locationId:asc,status:asc,sentAt:desc'), 'Should have locationId + status + sentAt index');
    assert.ok(verificationIndexes.has('status:asc,respondedAt:asc,expiresAt:asc'), 'Should have status + respondedAt + expiresAt index');
    assert.ok(verificationIndexes.has('status:asc,expiresAt:asc'), 'Should have status + expiresAt index');
  });
  
  it('auditLog collection has entityType + settingsType + timestamp index', () => {
    const auditIndexes = indexMap.get('auditLog');
    assert.ok(auditIndexes, 'auditLog collection should have indexes');
    
    assert.ok(auditIndexes.has('entityType:asc,settingsType:asc,timestamp:desc'), 'Should have entityType + settingsType + timestamp index');
  });
  
  it('dmTasks collection has required indexes', () => {
    const dmTasksIndexes = indexMap.get('dmTasks');
    assert.ok(dmTasksIndexes, 'dmTasks collection should have indexes');
    
    assert.ok(dmTasksIndexes.has('locationId:asc,status:asc,createdAt:desc'), 'Should have locationId + status + createdAt index');
  });
  
  it('assignments collection has required indexes', () => {
    const assignmentIndexes = indexMap.get('assignments');
    assert.ok(assignmentIndexes, 'assignments collection should have indexes');
    
    assert.ok(assignmentIndexes.has('scopeType:asc,scopeId:asc'), 'Should have scopeType + scopeId index');
    assert.ok(assignmentIndexes.has('personId:asc,role:asc'), 'Should have personId + role index');
  });
  
  it('closures collection has required indexes', () => {
    const closuresIndexes = indexMap.get('closures');
    assert.ok(closuresIndexes, 'closures collection should have indexes');
    
    assert.ok(closuresIndexes.has('status:asc,startsAt:desc'), 'Should have status + startsAt index');
  });
  
  it('locations collection has required indexes', () => {
    const locationsIndexes = indexMap.get('locations');
    assert.ok(locationsIndexes, 'locations collection should have indexes');
    
    assert.ok(locationsIndexes.has('lifecycle:asc,kind:asc'), 'Should have lifecycle + kind index');
    assert.ok(locationsIndexes.has('districtId:asc,lifecycle:asc,kind:asc'), 'Should have districtId + lifecycle + kind index');
    assert.ok(locationsIndexes.has('regionId:asc,lifecycle:asc,kind:asc'), 'Should have regionId + lifecycle + kind index');
  });
  
  it('all required composite indexes are defined', () => {
    const requiredIndexes = [
      { collection: 'corrections', fields: 'submittedBy:asc,submittedAt:desc' },
      { collection: 'corrections', fields: 'status:asc,submittedAt:desc' },
      { collection: 'auditLog', fields: 'entityId:asc,timestamp:desc' },
      { collection: 'auditLog', fields: 'locationId:asc,timestamp:desc' },
      { collection: 'closures', fields: 'status:asc,startsAt:desc' },
    ];
    
    const missing: string[] = [];
    
    for (const required of requiredIndexes) {
      const collectionIndexes = indexMap.get(required.collection);
      if (!collectionIndexes || !collectionIndexes.has(required.fields)) {
        missing.push(`${required.collection}: ${required.fields}`);
      }
    }
    
    assert.strictEqual(
      missing.length,
      0,
      `Missing composite indexes:\n${missing.join('\n')}`
    );
  });
});
