/**
* Unit tests for the MeadowEndpoints error reporting
*
* @license     MIT
*/

var Chai = require('chai');
var Expect = Chai.expect;

var libMeadowCommonServices = require('../source/Meadow-CommonServices.js');

var createHarness = function(pSettings)
{
	var tmpHarness = (
	{
		LogEntries: [],
		Sent: null,
		NextCalled: false
	});

	var tmpMockMeadow = (
	{
		fable:
		{
			settings: pSettings || {},
			log:
			{
				warn: function(pMessage, pDatum)
				{
					tmpHarness.LogEntries.push({ Message: pMessage, Datum: pDatum });
				},
				trace: function(pMessage, pDatum)
				{
					tmpHarness.LogEntries.push({ Message: pMessage, Datum: pDatum });
				}
			}
		}
	});

	tmpHarness.CommonServices = libMeadowCommonServices.new(tmpMockMeadow);

	tmpHarness.Response = (
	{
		send: function(pObject)
		{
			tmpHarness.Sent = pObject;
		}
	});

	tmpHarness.Request = (
	{
		url: '/1.0/Animal',
		RequestUUID: 'REQ-TEST',
		params: {},
		DAL: { scope: 'Animal' },
		UserSession: { SessionID: 'SESSION-TEST' }
	});

	tmpHarness.sendCodedError = function(pDefaultMessage, pError)
	{
		tmpHarness.CommonServices.sendCodedError(pDefaultMessage, pError, tmpHarness.Request, tmpHarness.Response,
			function()
			{
				tmpHarness.NextCalled = true;
			});

		return tmpHarness.Sent;
	};

	return tmpHarness;
};

suite
(
	'Meadow Endpoints Error Reporting',
	function()
	{
		suite
		(
			'sendCodedError',
			function()
			{
				test
				(
					'sends the Message and Code from an internally generated {Code, Message} error',
					function()
					{
						var tmpHarness = createHarness();

						var tmpSent = tmpHarness.sendCodedError('Error retreiving records by value.', { Code: 405, Message: 'UNAUTHORIZED ACCESS IS NOT ALLOWED' });

						Expect(tmpSent.Error).to.equal('UNAUTHORIZED ACCESS IS NOT ALLOWED');
						Expect(tmpSent.ErrorCode).to.equal(405);
						Expect(tmpHarness.NextCalled).to.equal(true);
					}
				);

				test
				(
					'sends the message text from a native database driver error',
					function()
					{
						var tmpHarness = createHarness();

						var tmpDriverError = new Error('Unknown column \'Nonexistent\' in \'field list\'');
						/** @type {any} */ (tmpDriverError).code = 'ER_BAD_FIELD_ERROR';
						/** @type {any} */ (tmpDriverError).errno = 1054;

						var tmpSent = tmpHarness.sendCodedError('Error retreiving records by value.', tmpDriverError);

						Expect(tmpSent.Error).to.contain('Unknown column \'Nonexistent\' in \'field list\'');
						Expect(tmpSent.Error).to.contain('ER_BAD_FIELD_ERROR');
						Expect(tmpSent.Error).to.contain('Error retreiving records by value.');
						Expect(tmpSent.ErrorCode).to.equal(1);
					}
				);

				test
				(
					'logs the driver code and stack alongside the message',
					function()
					{
						var tmpHarness = createHarness();

						var tmpDriverError = new Error('Duplicate entry');
						/** @type {any} */ (tmpDriverError).code = 'ER_DUP_ENTRY';

						tmpHarness.sendCodedError('Error creating a record.', tmpDriverError);

						Expect(tmpHarness.LogEntries.length).to.equal(1);
						Expect(tmpHarness.LogEntries[0].Message).to.contain('Duplicate entry');
						Expect(tmpHarness.LogEntries[0].Datum.ErrorSourceCode).to.equal('ER_DUP_ENTRY');
						Expect(tmpHarness.LogEntries[0].Datum.Stack).to.be.a('string');
					}
				);

				test
				(
					'appends a string error to the default message',
					function()
					{
						var tmpHarness = createHarness();

						var tmpSent = tmpHarness.sendCodedError('Error creating a record.', 'the widget exploded');

						Expect(tmpSent.Error).to.equal('Error creating a record. the widget exploded');
						Expect(tmpSent.ErrorCode).to.equal(1);
					}
				);

				test
				(
					'falls back to the default message when the error carries none',
					function()
					{
						var tmpHarness = createHarness();

						var tmpSent = tmpHarness.sendCodedError('Error upserting a record.', {});

						Expect(tmpSent.Error).to.contain('Error upserting a record.');
						Expect(tmpSent.ErrorCode).to.equal(1);
					}
				);

				test
				(
					'never sends an undefined Error message',
					function()
					{
						var tmpHarness = createHarness();

						var tmpCircularError = { Detail: 'circular' };
						tmpCircularError.Self = tmpCircularError;

						var tmpErrorShapes = [ null, undefined, 0, 42, true, {}, new Error(''), { Code: 500 }, 'oops', tmpCircularError, Object.create(null) ];

						for (var i = 0; i < tmpErrorShapes.length; i++)
						{
							var tmpSent = tmpHarness.sendCodedError('Error deleting a record.', tmpErrorShapes[i]);

							Expect(tmpSent.Error, 'error shape index ' + i).to.be.a('string');
							Expect(tmpSent.Error.length, 'error shape index ' + i).to.be.above(0);
							Expect(tmpSent.ErrorCode, 'error shape index ' + i).to.be.a('number');
						}
					}
				);

				test
				(
					'ignores a non-numeric Code rather than sending it as the ErrorCode',
					function()
					{
						var tmpHarness = createHarness();

						var tmpSent = tmpHarness.sendCodedError('Error retreiving a record.', { Code: 'NOT_A_NUMBER', Message: 'Something went wrong.' });

						Expect(tmpSent.Error).to.equal('Something went wrong.');
						Expect(tmpSent.ErrorCode).to.equal(1);
					}
				);
			}
		);

		suite
		(
			'refusal status codes',
			function()
			{
				test
				(
					'an authorizer refusal (code 405) is answered with HTTP 403 and keeps ErrorCode 405',
					function()
					{
						var tmpHarness = createHarness();

						var tmpSent = tmpHarness.sendCodedError('Error retreiving records by value.', { Code: 405, Message: 'UNAUTHORIZED ACCESS IS NOT ALLOWED' });

						Expect(tmpHarness.Response.statusCode).to.equal(403);
						Expect(tmpSent.ErrorCode).to.equal(405);
					}
				);

				test
				(
					'other coded errors leave the HTTP status alone',
					function()
					{
						var tmpHarness = createHarness();

						tmpHarness.sendCodedError('Error retreiving records by value.', { Code: 1, Message: 'Something went wrong' });

						Expect(tmpHarness.Response.statusCode).to.equal(undefined);
					}
				);

				test
				(
					'an unauthenticated request is answered with 401 and ErrorCode 401, after the configured delay',
					function(fDone)
					{
						var tmpHarness = createHarness({ UnauthorizedRequestDelay: 20 });
						tmpHarness.Request.EndpointAuthenticated = true;
						tmpHarness.Request.UserSession = { SessionID: 'SESSION-TEST', UserID: 0, UserRoleIndex: 0 };

						var tmpAuthorized = tmpHarness.CommonServices.authorizeEndpoint(tmpHarness.Request, tmpHarness.Response,
							function()
							{
								Expect(tmpHarness.Response.statusCode).to.equal(401);
								Expect(tmpHarness.Sent).to.deep.equal({ Error: 'You must be authenticated to access this resource.', ErrorCode: 401 });
								return fDone();
							});

						Expect(tmpAuthorized).to.equal(false);
						Expect(tmpHarness.Sent).to.equal(null);
					}
				);

				test
				(
					'a request below the endpoint\'s required level is answered with 403',
					function(fDone)
					{
						var tmpHarness = createHarness({ UnauthorizedRequestDelay: 1 });
						tmpHarness.Request.EndpointAuthenticated = true;
						tmpHarness.Request.EndpointAuthorizationRequirement = 3;
						tmpHarness.Request.UserSession = { SessionID: 'SESSION-TEST', UserID: 7, UserRoleIndex: 1 };

						tmpHarness.CommonServices.authorizeEndpoint(tmpHarness.Request, tmpHarness.Response,
							function()
							{
								Expect(tmpHarness.Response.statusCode).to.equal(403);
								Expect(tmpHarness.Sent.ErrorCode).to.equal(403);
								return fDone();
							});
					}
				);

				test
				(
					'an in-process invocation is refused immediately, without the remote-caller delay',
					function()
					{
						var tmpHarness = createHarness({ UnauthorizedRequestDelay: 60000 });
						tmpHarness.Request.EndpointAuthenticated = true;
						tmpHarness.Request.EndpointInvokedInProcess = true;
						tmpHarness.Request.UserSession = { SessionID: 'SESSION-TEST', UserID: 0, UserRoleIndex: 0 };

						tmpHarness.CommonServices.authorizeEndpoint(tmpHarness.Request, tmpHarness.Response,
							function()
							{
								tmpHarness.NextCalled = true;
							});

						Expect(tmpHarness.NextCalled).to.equal(true);
						Expect(tmpHarness.Sent).to.deep.equal({ Error: 'You must be authenticated to access this resource.', ErrorCode: 401 });
					}
				);
			}
		);
	}
);
