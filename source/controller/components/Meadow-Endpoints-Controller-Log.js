class MeadowEndpointsControllerLogBase
{
	/**
	 * @param {import('../Meadow-Endpoints-Controller-Base.js')} pController
	 */
	constructor(pController)
	{
		this._Controller = pController;
	}

	// This is called for every successful request log line.  Be careful what you add in overloads!
	prepareLogData(pRequest, pRequestState, pLogData)
	{
		// TODO: Discuss if these should be configurations
		if (pRequestState.hasOwnProperty('Record'))
		{
			if (pRequestState.Record.hasOwnProperty(this._Controller.DAL.defaultIdentifier))
			{
				pLogData[this._Controller.DAL.defaultIdentifier] = pRequestState.Record[this._Controller.DAL.defaultIdentifier];
			}
			if (pRequestState.Record.hasOwnProperty(this._Controller.DAL.defaultGUIdentifier))
			{
				pLogData[this._Controller.DAL.defaultGUIdentifier] = pRequestState.Record[this._Controller.DAL.defaultGUIdentifier];
			}
		}
		if (pRequestState.hasOwnProperty('UpdatedRecords'))
		{
			pLogData.UpdatedRecordCount = pRequestState.UpdatedRecords.length;
		}
		if (pRequestState.hasOwnProperty('CreatedRecords'))
		{
			pLogData.UpdatedRecordCount = pRequestState.CreatedRecords.length;
		}
		if (pRequestState.hasOwnProperty('UpsertedRecords'))
		{
			pLogData.UpdatedRecordCount = pRequestState.UpsertedRecords.length;
		}
		return pLogData;
	}

	// This is called whenever an endpoint is completed successfully
	requestCompletedSuccessfully(pRequest, pRequestState, pActionSummary)
	{
		let tmpLogData = (
			{
				SessionID: pRequestState.SessionData.SessionID,
				RequestID: pRequest.RequestUUID,
				RequestURL: pRequest.url,
				Scope: this._Controller.DAL.scope,
				Action: `${this._Controller.DAL.scope}-${pRequestState.Verb}`,
				Verb: pRequestState.Verb
			});

		this._Controller.log.info(pActionSummary, this.prepareLogData(pRequest, pRequestState, tmpLogData));
	}

	/**
	 * This is called whenever an endpoint needs to warn about a request without failing it
	 *
	 * @param {Record<string, any>} pRequest - the request being warned about
	 * @param {Record<string, any>} pRequestState - the request state (carries SessionData + Verb)
	 * @param {string} pWarningSummary - the warning text to log
	 * @returns {void}
	 */
	requestWarning(pRequest, pRequestState, pWarningSummary)
	{
		let tmpLogData = (
			{
				SessionID: pRequestState.SessionData.SessionID,
				RequestID: pRequest.RequestUUID,
				RequestURL: pRequest.url,
				Scope: this._Controller.DAL.scope,
				Action: `${this._Controller.DAL.scope}-${pRequestState.Verb}`,
				Verb: pRequestState.Verb
			});

		this._Controller.log.warn(pWarningSummary, this.prepareLogData(pRequest, pRequestState, tmpLogData));
	}

	// This is called whenever an endpoint is completed successfully
	logRequestError(pRequest, pRequestState, pError)
	{
		let tmpErrorLogData = (
			{
				SessionID: pRequestState.SessionData.SessionID,
				RequestID: pRequest.RequestUUID,
				RequestURL: pRequest.url,
				Scope: this._Controller.DAL.scope,
				Action: `${this._Controller.DAL.scope}-${pRequestState.Verb}`,
				Verb: pRequestState.Verb,
			});

		tmpErrorLogData = this._Controller.ErrorHandler.prepareRequestContextOutputObject(tmpErrorLogData, pRequest, pRequestState, pError);

		this._Controller.log.error(pError.message, this.prepareLogData(pRequest, pRequestState, tmpErrorLogData));
	}

	trace(pLogText, pLogObject)
	{
		this._Controller.DAL.log.trace(pLogText, pLogObject);
	}

	debug(pLogText, pLogObject)
	{
		this._Controller.DAL.log.debug(pLogText, pLogObject);
	}

	info(pLogText, pLogObject)
	{
		this._Controller.DAL.log.info(pLogText, pLogObject);
	}

	warn(pLogText, pLogObject)
	{
		this._Controller.DAL.log.warn(pLogText, pLogObject);
	}

	error(pLogText, pLogObject)
	{
		this._Controller.DAL.log.error(pLogText, pLogObject);
	}

	fatal(pLogText, pLogObject)
	{
		this._Controller.DAL.log.fatal(pLogText, pLogObject);
	}
}

module.exports = MeadowEndpointsControllerLogBase;
