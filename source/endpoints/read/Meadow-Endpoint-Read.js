/**
* Meadow Endpoint - Read a Record
*/
const doAPIEndpointRead = function(pRequest, pResponse, fNext)
{
	let tmpRequestState = this.initializeRequestState(pRequest, 'Read');
	let fBehaviorInjector = (pBehaviorHash) => { return (fStageComplete) => { this.BehaviorInjection.runBehavior(pBehaviorHash, this, pRequest, tmpRequestState, fStageComplete); }; };

	this.waterfall(
		[
			(fStageComplete) =>
			{
				tmpRequestState.Query = this.DAL.query;
				this.stampSessionOverrideOnQuery(tmpRequestState);
				return fStageComplete();
			},
			fBehaviorInjector(`Read-PreOperation`),
			(fStageComplete) =>
			{
				if (!pRequest.params.IDRecord && pRequest.params.GUIDRecord)
				{
					// We use a custom name for this (RequestDefaultIdentifier) in case there is a query with a dot in the default identifier.
					tmpRequestState.RecordSearchCriteria = `${this.DAL.defaultGUIdentifier} = ${pRequest.params.GUIDRecord}`;
					tmpRequestState.Query.addFilter(this.DAL.defaultGUIdentifier, pRequest.params.GUIDRecord, '=', 'AND', 'RequestDefaultIdentifier');
				}
				else if (pRequest.params.IDRecord)
				{
					// We use a custon name for this (RequestDefaultIdentifier) in case there is a query with a dot in the default identifier.
					tmpRequestState.RecordSearchCriteria = `${this.DAL.defaultIdentifier} = ${pRequest.params.IDRecord}`;
					tmpRequestState.Query.addFilter(this.DAL.defaultIdentifier, pRequest.params.IDRecord, '=', 'AND', 'RequestDefaultIdentifier');
				}
				else
				{
					return fStageComplete(this.ErrorHandler.getError('No ID Provided', 400));
				}
				return fStageComplete();
			},
			fBehaviorInjector(`Read-QueryConfiguration`),
			(fStageComplete) =>
			{
				try
				{
					this.DAL.doRead(tmpRequestState.Query, (pError, pQuery, pRecord) =>
					{
						if (!pRecord)
						{
							return fStageComplete(this.ErrorHandler.getError('Record not Found', 404));
						}
						tmpRequestState.Record = pRecord;
						return fStageComplete();
					});
				}
				catch (pQueryError)
				{
					return fStageComplete(pQueryError);
				}
			},
			fBehaviorInjector(`Read-PostOperation`),
			(fStageComplete) =>
			{
				pResponse.send(tmpRequestState.Record);
				this.log.requestCompletedSuccessfully(pRequest, tmpRequestState, `Read Record Where ${tmpRequestState.RecordSearchCriteria}`);
				return fStageComplete();
			}
		],
		(pError) =>
		{
			return this.ErrorHandler.handleErrorIfSet(pRequest, tmpRequestState, pResponse, pError, fNext);
		}
	);
};

module.exports = doAPIEndpointRead;