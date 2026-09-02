//TODO: This is only being referenced to allow compatibility with service_pieces
//TODO: There is risk of other incompatibilities until service_pieces is updated
const libUnderscore = require('underscore');

class MeadowEndpointsControllerBehaviorInjectionBase
{
	/**
	 * @param {import('../Meadow-Endpoints-Controller-Base.js')} pController
	 */
	constructor(pController)
	{
		this._Controller = pController;

		// The template compilation function
		//this.template = this._Controller.DAL.fable.Utility.template;
		this.template = libUnderscore.template;

		// An object to hold modifications to specific behaviors.
		this._BehaviorFunctions = {};

		// A set of objects to hold the specific templates and their compiled functions
		this._Templates = {};
		this._TemplateFunctions = {};
	}

	/**
	* Set a specific behavior.
	*
	* The anatomy of a behavior function is as follows:
	*
	* var someBehavior = function(pRequest, fCallback)
	* {
	*	  // Do some stuff with pRequest...
	*	  if (pRequest.UserSession.UserRoleIndex < 5)
	*		  tmpRequestState.Query.addFilter('Customer', pRequest.UserSession.IDCustomer);
	*	  return fCallback(false);
	* }
	*
	* It is important to note that the fCallback function expects false if no error, or an error if there is one.
	* An Error (ideally one from ErrorHandler.getError(), which carries an HTTP StatusCode) is preferred; a
	* string message is still accepted and is normalized to a 500 by the error handler.
	*/
	setBehavior(pBehaviorHash, fBehavior)
	{
		this._BehaviorFunctions[pBehaviorHash] = fBehavior;
	}

	/**
	* This method runs a behavior at a specific hash, and returns true.
	* Or it returns false if there was no behavior there.
	* Behaviors should expect their state to be in the pRequest object, per the example in setBehavior
	*/
	runBehavior(pBehaviorHash, pController, pRequest, pRequestState, fCallback)
	{
		// Run an injected behavior (if it exists)
		if (this._BehaviorFunctions.hasOwnProperty(pBehaviorHash))
		{
			try
			{
				// Call the behavior with the scoped [this] of the Meadow behavior
				// NOTE: If you define a behavior with lambda arrow syntax, it will *not* respect the call
				return this._BehaviorFunctions[pBehaviorHash].call(pController, pRequest, pRequestState, fCallback);
			}
			catch (pInjectedBehaviorError)
			{
				return fCallback(pInjectedBehaviorError);
			}
		}

		return fCallback();
	}

	/**
	* Get a template.
	*/
	getTemplate(pTemplateHash)
	{
		if (this._Templates.hasOwnProperty(pTemplateHash))
		{
			return this._Templates[pTemplateHash];
		}
		else
		{
			return false;
		}
	}

	/**
	* Set a template.
	*/
	setTemplate(pTemplateHash, pTemplate)
	{
		// Store both the cached text as well as the function
		this._Templates[pTemplateHash] = pTemplate;
		this._TemplateFunctions[pTemplateHash] = this.template(pTemplate);
	}

	/**
	* Get a template function.
	*/
	getTemplateFunction(pTemplateHash)
	{
		if (this._TemplateFunctions.hasOwnProperty(pTemplateHash))
		{
			return this._TemplateFunctions[pTemplateHash];
		}
		else
		{
			return false;
		}
	}

	/**
	* Process a template at a hash, and return the result.
	*/
	processTemplate(pTemplateHash, pTemplateData, pDefaultTemplate)
	{
		var tmpTemplateFunction = this.getTemplateFunction(pTemplateHash);
		var tmpTemplateData = (typeof(pTemplateData) === 'undefined') ? {} : pTemplateData;

		// This makes the function fairly laziliy loading.
		if (tmpTemplateFunction === false)
		{
			// If the template doesn't exist, try to use the passed-in default and set that as the template.
			// Otherwise make it empty.
			this.setTemplate(pTemplateHash, (typeof(pDefaultTemplate) === 'undefined') ? '' : pDefaultTemplate);
			tmpTemplateFunction = this.getTemplateFunction(pTemplateHash);
		}

		// Now process and return the underscore template.
		return tmpTemplateFunction(tmpTemplateData);
	}
}

module.exports = MeadowEndpointsControllerBehaviorInjectionBase;
