/**
 * Meadow Endpoints — per-request session override stamping.
 *
 * stampSessionOverrideOnQuery copies a real request session onto the meadow
 * query (Query.query.parameters.MeadowEndpointsSessionOverride) so a
 * downstream provider (the MeadowEndpoints provider, when a beacon fronts a
 * remote API) can act under the caller's identity. The default/anonymous
 * session is a no-op.
 *
 *   npx mocha test/MeadowEndpoints_SessionOverride_tests.js -u tdd --exit
 */

const Chai = require('chai');
const Expect = Chai.expect;

const libFable = require('fable');
const libMeadow = require('meadow');
const libMeadowEndpointsControllerBase = require('../source/controller/Meadow-Endpoints-Controller-Base.js');

const _BookSchema = require('../test_support/model/meadow_schema/BookStore-MeadowSchema-Book.json');

function buildController()
{
	let tmpFable = new libFable({ Product: 'SessionOverrideTest', LogStreams: [ { streamtype: 'console', level: 'fatal' } ] });
	let tmpMeadow = libMeadow.new(tmpFable, 'Book')
		.setSchema(_BookSchema.Schema)
		.setJsonSchema(_BookSchema.JsonSchema)
		.setDefaultIdentifier(_BookSchema.DefaultIdentifier)
		.setDefault(_BookSchema.DefaultObject);
	return new libMeadowEndpointsControllerBase({ DAL: tmpMeadow, _ControllerOptions: {} });
}

function realSession()
{
	return { SessionID: 'caller-session-xyz', CustomerID: 182, UserID: 5150, UserRoleIndex: 3, LoggedIn: true };
}

suite('Meadow-Endpoints session override stamping', () =>
{
	test('a real session is stamped onto the query parameters', () =>
	{
		let tmpController = buildController();
		let tmpRequestState = { SessionData: realSession(), Query: tmpController.DAL.query };
		tmpController.stampSessionOverrideOnQuery(tmpRequestState);
		let tmpOverride = tmpRequestState.Query.query.parameters.MeadowEndpointsSessionOverride;
		Expect(tmpOverride).to.be.an('object');
		Expect(tmpOverride.SessionID).to.equal('caller-session-xyz');
		Expect(tmpOverride.CustomerID).to.equal(182);
		Expect(tmpOverride.UserID).to.equal(5150);
	});

	test('the default/anonymous session (0x0000) is a no-op', () =>
	{
		let tmpController = buildController();
		let tmpRequestState = { SessionData: { SessionID: '0x0000', UserID: 0 }, Query: tmpController.DAL.query };
		tmpController.stampSessionOverrideOnQuery(tmpRequestState);
		Expect(tmpRequestState.Query.query.parameters.MeadowEndpointsSessionOverride).to.equal(undefined);
	});

	test('a missing SessionID is a no-op', () =>
	{
		let tmpController = buildController();
		let tmpRequestState = { SessionData: { UserID: 5 }, Query: tmpController.DAL.query };
		tmpController.stampSessionOverrideOnQuery(tmpRequestState);
		Expect(tmpRequestState.Query.query.parameters.MeadowEndpointsSessionOverride).to.equal(undefined);
	});

	test('missing Query or SessionData does not throw', () =>
	{
		let tmpController = buildController();
		Expect(() => tmpController.stampSessionOverrideOnQuery({})).to.not.throw();
		Expect(() => tmpController.stampSessionOverrideOnQuery({ SessionData: realSession() })).to.not.throw();
		Expect(() => tmpController.stampSessionOverrideOnQuery(null)).to.not.throw();
	});
});
