import { facetKeyValuePath } from '@/couchbase/facetKey';

describe('facetKeyValuePath', () => {
  it.each([
    ['ServiceName', 'd.`ServiceName`'],
    ['`service-name`', 'd.`service-name`'],
    ['service-name', 'd.`service-name`'],
    [
      "ResourceAttributes['k8s.pod.name']",
      'd.`ResourceAttributes`.`k8s.pod.name`',
    ],
    ["`Map-Attributes`['pod-name']", 'd.`Map-Attributes`.`pod-name`'],
    ['ResourceAttributes["a.b"]', 'd.`ResourceAttributes`.`a.b`'],
    ["LogAttributes['it''s']", "d.`LogAttributes`.`it's`"],
    [
      'ResourceAttributes.service.name',
      'IFMISSING(d.`ResourceAttributes`.`service.name`, d.`ResourceAttributes`.`service`.`name`)',
    ],
    ['ResourceAttributes.environment', 'd.`ResourceAttributes`.`environment`'],
    [
      '`__hdx_materialized_k8s.cluster.name`',
      'd.`__hdx_materialized_k8s.cluster.name`',
    ],
    [
      'ResourceAttributesJSON.`key`.`subKey`.`subSubKey`',
      'd.`ResourceAttributesJSON`.`key`.`subKey`.`subSubKey`',
    ],
    [
      '`JSON-Attributes`.`key-1`.`key-2`',
      'd.`JSON-Attributes`.`key-1`.`key-2`',
    ],
    ["  ResourceAttributes['x']  ", 'd.`ResourceAttributes`.`x`'],
  ])('%s', (key, expected) => {
    expect(facetKeyValuePath(key)).toBe(expected);
  });

  it.each([
    '',
    '``',
    '`unterminated',
    "Map['unterminated",
    'a.',
    'a b',
    "['x']",
    'a; DROP',
  ])('rejects %j', key => {
    expect(facetKeyValuePath(key)).toBeUndefined();
  });
});
