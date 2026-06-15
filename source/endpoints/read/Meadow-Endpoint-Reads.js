/**
* Meadow Endpoint - Read a Set of Records
*/
const doAPIEndpointReads = function(pRequest, pResponse, fNext)
{
	let tmpRequestState = this.initializeRequestState(pRequest, 'Reads');
	let fBehaviorInjector = (pBehaviorHash) => { return (fStageComplete) => { this.BehaviorInjection.runBehavior(pBehaviorHash, this, pRequest, tmpRequestState, fStageComplete); }; };

	this.waterfall(
	[
		(fStageComplete) =>
		{
			tmpRequestState.Query = this.DAL.query;
			this.stampSessionOverrideOnQuery(tmpRequestState);

			/** @type {number | boolean} */
			var tmpCap = false;
			/** @type {number | boolean} */
			var tmpBegin = false;
			if (typeof(pRequest.params.Begin) === 'string' ||
				typeof(pRequest.params.Begin) === 'number')
			{
				tmpBegin = parseInt(pRequest.params.Begin);
			}
			if (typeof(pRequest.params.Cap) === 'string' ||
				typeof(pRequest.params.Cap) === 'number')
			{
				tmpCap = parseInt(pRequest.params.Cap);
			}
			else
			{
				tmpCap = (this.settings['MeadowDefaultMaxCap']) || 250;
			}
			tmpRequestState.Query.setCap(tmpCap).setBegin(tmpBegin);
			if (typeof(pRequest.params.Filter) === 'string')
			{
				// If a filter has been passed in, parse it and add the values to the query.
				this.parseFilter(pRequest.params.Filter, tmpRequestState.Query);
			}
			else if (pRequest.params.Filter)
			{
				tmpRequestState.Query.setFilter(pRequest.params.Filter);
			}

			return fStageComplete();
		},
		fBehaviorInjector(`Reads-QueryConfiguration`),
		(fStageComplete) =>
		{
			this.DAL.doReads(tmpRequestState.Query, fStageComplete);
		},
		(pQuery, pRecords, fStageComplete) =>
		{
			if (!pRecords)
			{
				return fStageComplete(this.ErrorHandler.getError('No records found.', 404));
			}
			tmpRequestState.Records = pRecords;
			return fStageComplete();
		},
		fBehaviorInjector(`Reads-PostOperation`),
		(fStageComplete) =>
		{
			this.doStreamRecordArray(pResponse, tmpRequestState.Records, fStageComplete);
		},
		(fStageComplete) =>
		{
			this.log.requestCompletedSuccessfully(pRequest, tmpRequestState, 'Read a list of records.');
			return fStageComplete();
		}
	],
	(pError) =>
	{
		return this.ErrorHandler.handleErrorIfSet(pRequest, tmpRequestState, pResponse, pError, fNext);
	});
};

module.exports = doAPIEndpointReads;
