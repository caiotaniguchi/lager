'use strict';

const Promise = require('bluebird');
const _ = require('lodash');

const plugin = require('../index');

/**
 * This module exports a function that enrich the interactive command line and return a promise
 * @returns {Promise} - a promise that resolve when the operation is done
 */
module.exports = (icli) => {
  // First, retrieve possible values for the endpoint-identifiers parameter
  return getChoices()
  .then(choicesLists => {
    const config = {
      section: 'IAM plugin',
      cmd: 'deploy-policies',
      description: 'deploy policies',
      parameters: [{
        cmdSpec: '[policy-identifiers]',
        type: 'checkbox',
        choices: choicesLists.policyIdentifiers,
        question: {
          message: 'Which policies do you want to deploy?'
        }
      }, {
        cmdSpec: '-e, --environment [environment]',
        description: 'An environment identifier that will be used as a prefix',
        type: 'input',
        default: 'DEV',
        question: {
          message: 'Enter an environment identifier that will be used as a prefix',
          when: (answers, cmdParameterValues) => {
            return cmdParameterValues['environment'] === undefined && plugin.lager.getConfig('environment') === undefined;
          }
        }
      }, {
        cmdSpec: '-s, --stage [stage]',
        description: 'A stage identifier that will be used as a suffix',
        type: 'input',
        default: 'v0',
        question: {
          message: 'Enter a stage identifier that will be used as a suffix',
          when: (answers, cmdParameterValues) => {
            return cmdParameterValues['stage'] === undefined && plugin.lager.getConfig('stage') === undefined;
          }
        }
      }]
    };

    /**
     * Create the command and the promp
     */
    return icli.createSubCommand(config, executeCommand);
  });

  /**
   * Build the choices for "list" and "checkbox" parameters
   * @param {Array} endpoints - the list o available endpoint specifications
   * @returns {Object} - collection of lists of choices for "list" and "checkbox" parameters
   */
  function getChoices() {
    return plugin.loadPolicies()
    .then(policies => {
      // Build the list of available policies for input verification and interactive selection
      return Promise.resolve({
        policyIdentifiers: _.map(policies, policy => {
          return {
            value: policy.name,
            name: policy.name + (policy.description ? ' - ' + policy.description : '')
          };
        })
      });
    });
  }

  /**
   * Deploy policies
   * @param {Object} parameters - the parameters provided in the command and in the prompt
   * @returns {Promise<null>} - The execution stops here
   */
  function executeCommand(parameters) {
    if (parameters.environment === undefined) { parameters.environment = plugin.lager.getConfig('environment'); }
    if (parameters.stage === undefined) { parameters.stage = plugin.lager.getConfig('stage'); }
    const context = {
      stage: parameters.stage,
      environment: parameters.environment
    };
    return plugin.findPolicies(parameters.policyIdentifiers)
    .then(policies => {
      return Promise.map(policies, policy => { return policy.deploy(context); });
    })
    .then(policies => {
      console.log('\n    ' + icli.format.success('The following policies have been sucessfully deployed:'));
      console.log(_.map(policies, policy => { return '      - ' + policy.name + '\n'; }).join(''));
    })
    .catch(e => {
      if (e.code === 'AccessDenied' && e.cause && e.cause.message) {
        console.log('\n    ' + icli.format.error('Insufficient permissions to perform the action\n'));
        console.log('The IAM user/role you are using to perform this action does not have sufficient permissions.\n');
        console.log(e.cause.message + '\n');
        console.log('Please update the policies of the user/role before trying again.\n');
        process.exit(1);
      }
      throw e;
    });
  }

};
