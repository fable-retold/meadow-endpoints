/**
* Unit tests for the MeadowEndpoints lite list marshal
*
* @license     MIT
*/

var Chai = require('chai');
var Expect = Chai.expect;

var marshalLiteList = require('../source/crud/Meadow-Marshal-LiteList.js');

var createRequest = function()
{
	return (
	{
		DAL: { scope: 'Animal', defaultIdentifier: 'IDAnimal', defaultGUIdentifier: 'GUIDAnimal' },
		BehaviorModifications:
		{
			processTemplate: function(pTemplateHash, pTemplateData, pDefaultTemplate)
			{
				return 'Animal #' + pTemplateData.Record.IDAnimal;
			}
		}
	});
};

var createSavedAnimal = function(pIDAnimal)
{
	return (
	{
		IDAnimal: pIDAnimal,
		GUIDAnimal: 'GUID-' + pIDAnimal,
		CreateDate: '2020-01-01T00:00:00.000Z',
		CreatingIDUser: 1,
		UpdateDate: '2020-01-02T00:00:00.000Z',
		IDFarm: 7,
		Name: 'Animal ' + pIDAnimal,
		Type: 'Bunny'
	});
};

var createFailedAnimal = function(pGUIDAnimal)
{
	return (
	{
		GUIDAnimal: pGUIDAnimal,
		Name: 'Rejected',
		Type: 'Bunny',
		Error: 'Error upserting record: Record with GUID ' + pGUIDAnimal + ' already exists!'
	});
};

var serialize = function(pLiteList)
{
	return JSON.parse(JSON.stringify(pLiteList));
};

suite
(
	'Meadow Endpoints Lite List Marshal',
	function()
	{
		test
		(
			'an all-success list serializes with the same fields and order as before',
			function()
			{
				var tmpLiteList = marshalLiteList([ createSavedAnimal(1), createSavedAnimal(2) ], createRequest());
				Expect(JSON.stringify(tmpLiteList)).to.equal(
					'[{"Value":"Animal #1","IDAnimal":1,"GUIDAnimal":"GUID-1","UpdateDate":"2020-01-02T00:00:00.000Z","CreatingIDUser":1,"IDFarm":7},' +
					'{"Value":"Animal #2","IDAnimal":2,"GUIDAnimal":"GUID-2","UpdateDate":"2020-01-02T00:00:00.000Z","CreatingIDUser":1,"IDFarm":7}]');
			}
		);
		test
		(
			'a failed first record does not strip the fields of the records after it',
			function()
			{
				var tmpLiteList = serialize(marshalLiteList([ createFailedAnimal('GUID-X'), createSavedAnimal(2), createSavedAnimal(3) ], createRequest()));
				Expect(tmpLiteList).to.have.length(3);
				Expect(tmpLiteList[0]).to.not.have.property('IDAnimal');
				Expect(tmpLiteList[0].GUIDAnimal).to.equal('GUID-X');
				Expect(tmpLiteList[0].Error).to.contain('already exists');
				Expect(tmpLiteList[1]).to.deep.equal({ Value: 'Animal #2', IDAnimal: 2, GUIDAnimal: 'GUID-2', UpdateDate: '2020-01-02T00:00:00.000Z', CreatingIDUser: 1, IDFarm: 7 });
				Expect(tmpLiteList[2].IDAnimal).to.equal(3);
				Expect(tmpLiteList[2].IDFarm).to.equal(7);
				Expect(tmpLiteList[2]).to.not.have.property('Error');
			}
		);
		test
		(
			'a failed record after a successful one keeps its Error',
			function()
			{
				var tmpLiteList = serialize(marshalLiteList([ createSavedAnimal(1), createFailedAnimal('GUID-Y'), createSavedAnimal(3) ], createRequest()));
				Expect(tmpLiteList[1].GUIDAnimal).to.equal('GUID-Y');
				Expect(tmpLiteList[1].Error).to.equal('Error upserting record: Record with GUID GUID-Y already exists!');
				Expect(tmpLiteList[1]).to.not.have.property('IDAnimal');
				Expect(tmpLiteList[0]).to.not.have.property('Error');
				Expect(tmpLiteList[2]).to.not.have.property('Error');
				Expect(tmpLiteList[2].IDAnimal).to.equal(3);
			}
		);
		test
		(
			'caller-supplied columns are kept when any record carries them and dropped when none does',
			function()
			{
				var tmpLiteList = serialize(marshalLiteList([ createFailedAnimal('GUID-Z'), createSavedAnimal(2) ], createRequest(), [ 'Type', 'Weight' ]));
				Expect(tmpLiteList[0].Type).to.equal('Bunny');
				Expect(tmpLiteList[1].Type).to.equal('Bunny');
				Expect(tmpLiteList[1]).to.not.have.property('Weight');
			}
		);
		test
		(
			'a list where every record failed falls back to the first record and each keeps its own identity and Error',
			function()
			{
				var tmpFailedUpdate = function(pIDAnimal)
				{
					return ({ IDAnimal: pIDAnimal, GUIDAnimal: 'GUID-' + pIDAnimal, Name: 'Rejected', Error: 'Error upserting record: rejected ' + pIDAnimal });
				};
				var tmpLiteList = serialize(marshalLiteList([ tmpFailedUpdate(4), tmpFailedUpdate(5) ], createRequest()));
				Expect(tmpLiteList).to.deep.equal(
					[
						{ Value: 'Animal #4', IDAnimal: 4, GUIDAnimal: 'GUID-4', Error: 'Error upserting record: rejected 4' },
						{ Value: 'Animal #5', IDAnimal: 5, GUIDAnimal: 'GUID-5', Error: 'Error upserting record: rejected 5' }
					]);
			}
		);
		test
		(
			'an empty list marshals to an empty list',
			function()
			{
				Expect(marshalLiteList([], createRequest())).to.deep.equal([]);
			}
		);
	}
);
