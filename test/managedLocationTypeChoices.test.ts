import test from 'node:test';
import assert from 'node:assert/strict';
import { preservesLocationClassification } from '../src/lib/managedHierarchyEditing';
test('managed type choices preserve use in both directions and never guess unknown classifications',()=>{
  const retail=['Enclosed Mall','Strip Center / Shopping Center','Street / Standalone Location'],other=['Corporate Office','Warehouse / Distribution Center','Other Company Location'];
  for(const group of [retail,other])for(const before of group)for(const after of group)assert.equal(preservesLocationClassification(before,after),true);
  for(const before of retail)for(const after of other){assert.equal(preservesLocationClassification(before,after),false);assert.equal(preservesLocationClassification(after,before),false);}
  for(const unknown of [undefined,null,'unknown']){assert.equal(preservesLocationClassification(unknown,retail[0]),false);assert.equal(preservesLocationClassification(other[0],unknown),false);assert.equal(preservesLocationClassification(unknown,unknown),true);}
});
