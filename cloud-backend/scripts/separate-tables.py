import concurrent.futures, hashlib, json, os, time
from decimal import Decimal
from pathlib import Path
import boto3
from botocore.config import Config

REGION = 'ap-southeast-2'
ACCOUNT = '561633119560'
PREFIX = 'peopleshr-'
CONTROL = 'peoples-management-hr-data-v1'
MARKER = 'SEPARATE_TABLES_V1'

def run():
    export = Path.home() / 'hr-data-transfer/hr-collections-export.json'
    raw = export.read_bytes()
    snapshot = hashlib.sha256(raw).hexdigest()
    data = json.loads(raw, parse_float=Decimal)
    assert data['format'] == 'hr-collections-v1'
    collections = data['collections']
    assert len(collections) == 117
    assert len({c['name'] for c in collections}) == len(collections)
    assert sum(c['count'] for c in collections) == 7480
    for c in collections:
        assert len(c['items']) == c['count']
        assert len({i['recordKey'] for i in c['items']}) == c['count']
        assert all(i['collection'] == c['name'] and '_hrRecordKey' not in i['data'] for i in c['items'])
    config = Config(retries={'mode': 'standard', 'max_attempts': 10})
    session = boto3.Session(region_name=REGION)
    assert session.client('sts', config=config).get_caller_identity()['Account'] == ACCOUNT
    client = session.client('dynamodb', config=config)
    resource = session.resource('dynamodb', config=config)
    control = resource.Table(CONTROL)
    marker = control.get_item(Key={'collection':'_migration','recordKey':'IMPORT'}, ConsistentRead=True).get('Item',{})
    assert marker.get('status') == 'COMPLETE' and marker.get('rows') == 7480
    # All clients/resources used by workers are created independently.
    def migrate(c):
        worker = boto3.Session(region_name=REGION)
        db = worker.client('dynamodb', config=config)
        table_name = PREFIX + c['name']
        tags = [{'Key':'Project','Value':'PeoplesHR'},{'Key':'SourceTable','Value':c['name']},{'Key':'MigrationSnapshot','Value':snapshot}]
        try:
            desc = db.describe_table(TableName=table_name)['Table']
            existing_tags = {t['Key']: t['Value'] for t in db.list_tags_of_resource(ResourceArn=desc['TableArn'])['Tags']}
            if not all(existing_tags.get(t['Key']) == t['Value'] for t in tags):
                raise RuntimeError('Refusing unrelated existing table: ' + table_name)
        except db.exceptions.ResourceNotFoundException:
            db.create_table(TableName=table_name, BillingMode='PAY_PER_REQUEST', AttributeDefinitions=[{'AttributeName':'_hrRecordKey','AttributeType':'S'}], KeySchema=[{'AttributeName':'_hrRecordKey','KeyType':'HASH'}], SSESpecification={'Enabled':True}, DeletionProtectionEnabled=True, Tags=tags)
        db.get_waiter('table_exists').wait(TableName=table_name, WaiterConfig={'Delay':2,'MaxAttempts':150})
        for attempt in range(24):
            try:
                db.update_continuous_backups(TableName=table_name, PointInTimeRecoverySpecification={'PointInTimeRecoveryEnabled':True})
                break
            except db.exceptions.ContinuousBackupsUnavailableException:
                if attempt == 23: raise
                time.sleep(5)
        table = worker.resource('dynamodb', config=config).Table(table_name)
        expected = {i['recordKey']:dict(i['data'], _hrRecordKey=i['recordKey']) for i in c['items']}
        actual = {}
        cursor = None
        while True:
            args = {'ConsistentRead':True}
            if cursor: args['ExclusiveStartKey'] = cursor
            result = table.scan(**args)
            for item in result.get('Items',[]): actual[item['_hrRecordKey']] = item
            cursor = result.get('LastEvaluatedKey')
            if not cursor: break
        if any(k not in expected or item != expected[k] for k,item in actual.items()):
            raise RuntimeError('Existing data differs; preserving table: ' + table_name)
        with table.batch_writer() as writer:
            for k,item in expected.items():
                if k not in actual: writer.put_item(Item=item)
        verified = {}
        cursor = None
        while True:
            args = {'ConsistentRead':True}
            if cursor: args['ExclusiveStartKey'] = cursor
            result = table.scan(**args)
            for item in result.get('Items',[]): verified[item['_hrRecordKey']] = item
            cursor = result.get('LastEvaluatedKey')
            if not cursor: break
        if verified != expected: raise RuntimeError('Verification failed: ' + table_name)
        print(json.dumps({'verified':table_name,'rows':len(verified)}),flush=True)
        return {'source':c['name'],'table':table_name,'rows':len(verified),'primaryKey':c['primaryKey']}
    verified = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for result in pool.map(migrate, collections): verified.append(result)
    manifest = {'status':'COMPLETE','prefix':PREFIX,'snapshot':snapshot,'tables':verified,'rows':sum(t['rows'] for t in verified),'sourceSnapshotAt':data['createdAt'],'completedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
    control.put_item(Item=dict(manifest, collection='_migration',recordKey=MARKER))
    output = Path.home() / 'hr-separated-tables-manifest.json'
    output.write_text(json.dumps(manifest, indent=2))
    print(json.dumps({'status':'SEPARATE_TABLES_COMPLETE','tables':len(verified),'rows':manifest['rows'],'prefix':PREFIX}),flush=True)

if __name__ == '__main__':
    run()