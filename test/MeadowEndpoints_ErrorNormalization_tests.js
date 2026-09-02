/**
 * Meadow Endpoints — error normalization on the response path.
 *
 * Every endpoint funnels failures through ErrorHandler.handleErrorIfSet ->
 * sendError, which reads `message` / `StatusCode` off the error. Errors that
 * arrive in another shape — a string (the documented behavior-injection
 * contract) or a legacy {Code, Message} object — carry neither, so without
 * normalization the client gets an empty body and the log line gets undefined.
 *
 *   npx mocha test/MeadowEndpoints_ErrorNormalization_tests.js -u tdd --exit
 */

const Chai = require('chai');
const Expect = Chai.expect;

const libFable = require('fable');
const libMeadow = require('meadow');
const libMeadowEndpointsControllerBase = require('../source/controller/Meadow-Endpoints-Controller-Base.js');

const _BookSchema = require('../test_support/model/meadow_schema/BookStore-MeadowSchema-Book.json');

function buildController()
{
	let tmpFable = new libFable({ Product: 'ErrorNormalizationTest', LogStreams: [ { streamtype: 'console', level: 'fatal' } ] });
	let tmpMeadow = libMeadow.new(tmpFable, 'Book')
		.setSchema(_BookSchema.Schema)
		.setJsonSchema(_BookSchema.JsonSchema)
		.setDefaultIdentifier(_BookSchema.DefaultIdentifier)
		.setDefault(_BookSchema.DefaultObject);
	return new libMeadowEndpointsControllerBase({ DAL: tmpMeadow, _ControllerOptions: {} });
}

function sendError(pController, pError)
{
	let tmpResult = { StatusCode: null, Body: null, CallbackError: null };

	let tmpResponse = (
		{
			status: (pStatusCode) => { tmpResult.StatusCode = pStatusCode; },
			send: (pBody) => { tmpResult.Body = pBody; }
		});

	let tmpRequest = { url: '/1.0/Book', RequestUUID: 'REQ-TEST' };
	let tmpRequestState = { SessionData: { SessionID: 'SESSION-TEST' }, Verb: 'Update' };

	pController.ErrorHandler.sendError(tmpRequest, tmpRequestState, tmpResponse, pError,
		(pCallbackError) => { tmpResult.CallbackError = pCallbackError; });

	return tmpResult;
}

suite('Meadow-Endpoints error normalization', () =>
{
	test('a native Error passes through with its message intact', () =>
	{
		let tmpDriverError = Object.assign(new Error('Unknown column \'Nonexistent\' in \'field list\''), { code: 'ER_BAD_FIELD_ERROR' });

		let tmpResult = sendError(buildController(), tmpDriverError);

		Expect(tmpResult.Body.Error).to.equal('Unknown column \'Nonexistent\' in \'field list\'');
		Expect(tmpResult.Body.Code).to.equal('ER_BAD_FIELD_ERROR');
		Expect(tmpResult.StatusCode).to.equal(500);
	});

	test('an error from getError keeps its message and status code', () =>
	{
		let tmpController = buildController();

		let tmpResult = sendError(tmpController, tmpController.ErrorHandler.getError('Record not Found', 404));

		Expect(tmpResult.Body.Error).to.equal('Record not Found');
		Expect(tmpResult.Body.StatusCode).to.equal(404);
		Expect(tmpResult.StatusCode).to.equal(404);
	});

	test('a legacy {Code, Message} error reports its message and maps Code to the status code', () =>
	{
		let tmpResult = sendError(buildController(), { Code: 400, Message: 'Columns to distinct on must be provided.' });

		Expect(tmpResult.Body.Error).to.equal('Columns to distinct on must be provided.');
		Expect(tmpResult.Body.StatusCode).to.equal(400);
		Expect(tmpResult.StatusCode).to.equal(400);
	});

	test('a string error - the documented behavior injection contract - reports its message', () =>
	{
		let tmpResult = sendError(buildController(), 'Record update failure - a valid record ID is required in the passed-in record.');

		Expect(tmpResult.Body.Error).to.equal('Record update failure - a valid record ID is required in the passed-in record.');
		Expect(tmpResult.Body.StatusCode).to.equal(500);
		Expect(tmpResult.StatusCode).to.equal(500);
	});

	test('a non-status Code is not used as the HTTP status code', () =>
	{
		let tmpResult = sendError(buildController(), { Code: 1054, Message: 'Unknown column.' });

		Expect(tmpResult.Body.Error).to.equal('Unknown column.');
		Expect(tmpResult.StatusCode).to.equal(500);
	});

	test('the callback receives a real Error regardless of the shape sent in', () =>
	{
		let tmpResult = sendError(buildController(), 'something broke');

		Expect(tmpResult.CallbackError).to.be.an.instanceOf(Error);
		Expect(tmpResult.CallbackError.message).to.equal('something broke');
	});

	test('never sends an empty body or an undefined message', () =>
	{
		let tmpController = buildController();

		let tmpCircularError = { Detail: 'circular' };
		tmpCircularError.Self = tmpCircularError;

		let tmpErrorShapes = [ 0, 42, true, {}, { Code: 500 }, new Error(''), 'oops', tmpCircularError, Object.create(null), [] ];

		for (let i = 0; i < tmpErrorShapes.length; i++)
		{
			let tmpResult = sendError(tmpController, tmpErrorShapes[i]);

			Expect(tmpResult.Body, 'error shape index ' + i).to.be.an('object');
			Expect(tmpResult.Body.Error, 'error shape index ' + i).to.be.a('string');
			Expect(tmpResult.Body.Error.length, 'error shape index ' + i).to.be.above(0);
			Expect(tmpResult.StatusCode, 'error shape index ' + i).to.be.a('number');
		}
	});

	test('an object with no message of its own still reports its payload', () =>
	{
		let tmpResult = sendError(buildController(), { ErrorDetail: 'weird shape', Attempt: 7 });

		Expect(tmpResult.Body.Error).to.contain('weird shape');
	});
});

suite('Meadow-Endpoints per-record error markers', () =>
{
	// The bulk endpoints answer 200 and mark a failed row in-band with a Record.Error
	// property. An Error object cannot carry the message there, because `message` is not
	// an enumerable own property and JSON.stringify drops it.
	test('getErrorMessage flattens an Error to a message that survives JSON serialization', () =>
	{
		let tmpController = buildController();

		let tmpMarker = { Error: tmpController.ErrorHandler.getErrorMessage(new Error('The storage engine refused this row.')) };

		Expect(JSON.parse(JSON.stringify(tmpMarker)).Error).to.equal('The storage engine refused this row.');
	});

	test('a raw Error would not have survived that serialization', () =>
	{
		let tmpMarker = { Error: new Error('The storage engine refused this row.') };

		Expect(JSON.parse(JSON.stringify(tmpMarker)).Error).to.not.have.property('message');
	});

	test('getErrorMessage flattens every other error shape to a non-empty string', () =>
	{
		let tmpController = buildController();

		let tmpErrorShapes = [ 'a string failure', { Code: 500, Message: 'a legacy failure' }, { Detail: 'no message' }, 42, {} ];

		for (let i = 0; i < tmpErrorShapes.length; i++)
		{
			let tmpMessage = tmpController.ErrorHandler.getErrorMessage(tmpErrorShapes[i]);

			Expect(tmpMessage, 'error shape index ' + i).to.be.a('string');
			Expect(tmpMessage.length, 'error shape index ' + i).to.be.above(0);
		}

		Expect(tmpController.ErrorHandler.getErrorMessage({ Code: 500, Message: 'a legacy failure' })).to.equal('a legacy failure');
	});
});
