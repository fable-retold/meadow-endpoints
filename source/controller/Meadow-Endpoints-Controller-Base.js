const libAsyncWaterfall = require('async/waterfall');

const libBaseLogController = require('./components/Meadow-Endpoints-Controller-Log.js')

const libBaseErrorController = require('./components/Meadow-Endpoints-Controller-Error.js');
const libBaseBehaviorInjectionController = require('./components/Meadow-Endpoints-Controller-BehaviorInjection.js');

const libMeadowEndpointsFilterParser = require('./utility/Meadow-Endpoints-Filter-Parser.js');
const libMeadowEndpointsSessionMarshaler = require('./utility/Meadow-Endpoints-Session-Marshaler.js');
const libMeadowEndpointsStreamRecordArray = require('./utility/Meadow-Endpoints-Stream-RecordArray.js');

class MeadowEndpointControllerBase
{
	/**
	 * @param {import('../Meadow-Endpoints.js')} pMeadowEndpoints
	 */
	constructor(pMeadowEndpoints)
	{
		this.DAL = pMeadowEndpoints.DAL;
		this.ControllerOptions = pMeadowEndpoints._ControllerOptions;

		// Application Services
		this._Settings = null;
		this._LogController = null;

		// Logic and Behavior
		this._BehaviorInjectionController = null;
		this._ErrorController = null;

		// Internal async utility functions
		this.waterfall = this.DAL.fable.Utility.waterfall;
		this.eachLimit = this.DAL.fable.Utility.eachLimit;
		this.extend = this.DAL.fable.Utility.extend;

		//FIXME: not sure what this is supposed to do, it was broken before
		//if ((typeof(this.ControllerOptions) != 'object') || this.ControllerOptions.hasOwnProperty('ControllerClass'))
		{
			this.initializeDefaultUnsetControllers(this);
		}

		// Behavior functions
		this._FilterParser = new libMeadowEndpointsFilterParser(this);
		this._SessionMarshaler = new libMeadowEndpointsSessionMarshaler(this);
		this._StreamRecordArray = new libMeadowEndpointsStreamRecordArray(this);
	}

	/**
	 * @param {import('./Meadow-Endpoints-Controller-Base.js')} pController
	 */
	initializeDefaultUnsetControllers(pController)
	{
		// Application Services
		if (!this._Settings)
		{
			this._Settings = pController.DAL.fable.settings;
		}
		if (!this._Settings.hasOwnProperty('MeadowEndpointsDefaultSessionObject'))
		{
			this._Settings.MeadowEndpointsDefaultSessionObject = (
				{
					CustomerID: 0,
					SessionID: '0x0000',
					DeviceID: 'Unset',
					UserID: 0,
					UserRole: 'None',
					UserRoleIndex: 0,
					LoggedIn: false
				});
		}
		if (!this._LogController)
		{
			this._LogController = new libBaseLogController(pController);
		}
		if (!this._BehaviorInjectionController)
		{
			this._BehaviorInjectionController = new libBaseBehaviorInjectionController(pController);
		}
		if (!this._ErrorController)
		{
			this._ErrorController = new libBaseErrorController(pController);
		}
	}

	initializeRequestState(pRequest, pVerb)
	{
		let tmpRequestState = {};

		tmpRequestState.Verb = (typeof(pVerb) == 'string') ? pVerb : 'Unnamed_Custom_Behavior';
		tmpRequestState.SessionData = this.getSessionData(pRequest);

		return tmpRequestState;
	}

	// Clone the session data and verb to a new request state object
	cloneAsyncSafeRequestState(pRequestState, pNewVerb)
	{
		let tmpSafeRequestState = (
			{
				ParentRequestState: pRequestState,
				SessionData: pRequestState.SessionData
			});

		tmpSafeRequestState.Verb = (typeof(pNewVerb) == 'string') ? pNewVerb : pRequestState.Verb;

		return tmpSafeRequestState;
	}

	// Override this to provide an alternate ending function that is run with every endpoint.
	_BeginDataRequestFunction(pRequest, pResponse, fNext)
	{
		return fNext();
	}

	beginMeadowRequest(pRequest, pResponse, fNext)
	{
		this._BeginDataRequestFunction(pRequest, pResponse, fNext);
	}

	// Override this to provide an alternate ending function that is run with every endpoint.
	_EndDataRequestFunction(pRequest, pResponse, fNext)
	{
		return fNext();
	}

	endMeadowRequest(pRequest, pResponse, fNext)
	{
		this._EndDataRequestFunction(pRequest, pResponse, fNext);
	}

	// Application Services
	get settings() {return this._Settings; }
	set settings(pSettings) { this._Settings = pSettings; }

	get log() {return this._LogController; }
	set log(pLogController) { this._LogController = pLogController; }

	// Logic and Behavior
	get BehaviorInjection() {return this._BehaviorInjectionController; }
	set BehaviorInjection(pBehaviorInjectionController) { this._BehaviorInjectionController = pBehaviorInjectionController; }

	get ErrorHandler() {return this._ErrorController; }
	set ErrorHandler(pErrorController) { this._ErrorController = pErrorController; }

	parseFilter(pFilterString, pQuery)
	{
		return this._FilterParser.parseFilter(pFilterString, pQuery);
	}

	doStreamRecordArray(pResponse, pRecords, fCallback)
	{
		return this._StreamRecordArray.streamRecordArray(pResponse, pRecords, fCallback);
	}

	getSessionData(pRequest)
	{
		return this._SessionMarshaler.getSessionData(pRequest);
	}

	/**
	 * Stamp the request's session onto a meadow query so a downstream provider
	 * can act under the caller's identity.
	 *
	 * Today only the MeadowEndpoints provider consumes this — when a beacon
	 * fronts a remote meadow-endpoints API it presents this session upstream
	 * (instead of its bound machine session) so the remote enforces row-level
	 * auth as the real caller. SQL providers ignore the parameter. The override
	 * rides the per-operation FoxHound query (concurrency-safe).
	 *
	 * No-op for the default/anonymous session (UserID 0 / SessionID 0x0000) —
	 * those carry no identity, so the provider keeps its existing behavior.
	 *
	 * @param {object} pRequestState - the request state (carries SessionData + Query)
	 * @returns {void}
	 */
	stampSessionOverrideOnQuery(pRequestState)
	{
		if (!pRequestState || !pRequestState.Query || !pRequestState.SessionData)
		{
			return;
		}
		let tmpSession = pRequestState.SessionData;
		let tmpSessionID = tmpSession.SessionID;
		if (typeof(tmpSessionID) !== 'string' || tmpSessionID.length < 1 || tmpSessionID === '0x0000')
		{
			return;
		}
		if (pRequestState.Query.query && pRequestState.Query.query.parameters)
		{
			pRequestState.Query.query.parameters.MeadowEndpointsSessionOverride = (
				{
					SessionID: tmpSessionID,
					CustomerID: tmpSession.CustomerID,
					UserID: tmpSession.UserID,
					UserRoleIndex: tmpSession.UserRoleIndex
				});
		}
	}
}

module.exports = MeadowEndpointControllerBase;

// Export the base classes for the controller components, for inheritance
module.exports.BaseErrorController = libBaseErrorController;
module.exports.BaseBehaviorInjectionController = libBaseBehaviorInjectionController;

module.exports.BaseFilterParser = libMeadowEndpointsFilterParser;
module.exports.BaseSessionMarshaler = libMeadowEndpointsSessionMarshaler;
module.exports.BaseStreamRecordArray = libMeadowEndpointsStreamRecordArray;
