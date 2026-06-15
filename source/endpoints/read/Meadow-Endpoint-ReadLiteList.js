/**
* Meadow Endpoint - Read a list of lite Records (for Drop-downs and such)
*/
const marshalLiteList = require('./Meadow-Marshal-LiteList.js');

const doAPIEndpointReadLite = function(pRequest, pResponse, fNext)
{
	let tmpRequestState = this.initializeRequestState(pRequest, 'ReadsLite');
	let fBehaviorInjector = (pBehaviorHash) => { return (fStageComplete) => { this.BehaviorInjection.runBehavior(pBehaviorHash, this, pRequest, tmpRequestState, fStageComplete); }; };

	this.waterfall(
		[
			// 1a. Get the records
			(fStageComplete) =>
			{
				tmpRequestState.Query = this.DAL.query;
				this.stampSessionOverrideOnQuery(tmpRequestState);
				// TODO: Limit the query to the columns we need for the templated expression

				/** @type {number | boolean} */
				var tmpCap = false;
				/** @type {number | boolean} */
				var tmpBegin = false;
				if (typeof(pRequest.params.Begin) === 'string' ||
					typeof(pRequest.params.Begin) === 'number')
				{
					tmpBegin = parseInt(pRequest.params.Begin, 10);
				}
				if (typeof(pRequest.params.Cap) === 'string' ||
					typeof(pRequest.params.Cap) === 'number')
				{
					tmpCap = parseInt(pRequest.params.Cap, 10);
				}
				else
				{
					//maximum number of records to return by default on Read queries. Override via "MeadowDefaultMaxCap" fable setting.
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
				if (pRecords.length < 1)
				{
					pRecords = [];
				}
				tmpRequestState.RawRecords = pRecords;
				// Expose the loaded records under pRequestState.Records
				// so post-op hooks operate on the same shape regular
				// Reads uses. Marshalling to lite shape runs AFTER the
				// hook so hooks see full rows.
				tmpRequestState.Records = pRecords;
				return fStageComplete();
			},
			fBehaviorInjector(`ReadsLite-PostOperation`),
			(fStageComplete) =>
			{
				tmpRequestState.Records = marshalLiteList.call(this, tmpRequestState.RawRecords, pRequest, (typeof(pRequest.params.ExtraColumns) === 'string') ? pRequest.params.ExtraColumns.split(',') : []);
				return fStageComplete();
			},
			(fStageComplete) =>
			{
				return this.doStreamRecordArray(pResponse, tmpRequestState.Records, fNext);
			},
			(fStageComplete) =>
			{
				this.log.requestCompletedSuccessfully(pRequest, tmpRequestState, `Read a recordset lite list with ${tmpRequestState.Records.length} results`);
				return fStageComplete();
			}
		],
		(pError, pResultRecords) =>
		{
			return this.ErrorHandler.handleErrorIfSet(pRequest, tmpRequestState, pResponse, pError, fNext);
		}
	);
};

module.exports = doAPIEndpointReadLite;
