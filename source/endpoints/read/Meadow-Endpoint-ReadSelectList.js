/**
* Meadow Endpoint - Read a select list of Records (for Drop-downs and such)
*/
const doAPIEndpointReadSelectList = function(pRequest, pResponse, fNext)
{
	let tmpRequestState = this.initializeRequestState(pRequest, 'ReadsBy');
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
					this.parseFilter(pRequest.params.Filter, tmpRequestState.Query);
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

				tmpRequestState.Records = pRecords;

				return fStageComplete();
			},
			// Stage-specific post-op hook. Fires after DAL read but
			// BEFORE the records are projected to select-list
			// (Hash/Value) shape, so handlers can run against full
			// rows. Separate from Reads-PostOperation so registering
			// one doesn't unintentionally fire on the other.
			fBehaviorInjector(`ReadSelectList-PostOperation`),
			(fStageComplete) =>
			{
				tmpRequestState.SelectList = [];

				for (var i = 0; i < tmpRequestState.Records.length; i++)
				{
					tmpRequestState.SelectList.push
					(
						{
							Hash: tmpRequestState.Records[i][this.DAL.defaultIdentifier],
							Value: this.BehaviorInjection.processTemplate('SelectList', {Record:tmpRequestState.Records[i]}, this.DAL.scope+' #<%= Record.'+this.DAL.defaultIdentifier+'%>')
						}
					);
				}

				return fStageComplete();
			},
			(fStageComplete) =>
			{
				return this.doStreamRecordArray(pResponse, tmpRequestState.SelectList, fStageComplete);
			},
			(fStageComplete) =>
			{
				this.log.requestCompletedSuccessfully(pRequest, tmpRequestState, `Read a recordset lite list with ${tmpRequestState.SelectList.length} results.`);
				return fStageComplete();
			}
		],
		(pError, pResultRecords) =>
		{
			return this.ErrorHandler.handleErrorIfSet(pRequest, tmpRequestState, pResponse, pError, fNext);
		}
	);
};

module.exports = doAPIEndpointReadSelectList;
