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
      cmd: 'deploy-roles',
      description: 'deploy roles',
      parameters: [{
        cmdSpec: '[role-identifiers]',
        type: 'checkbox',
        choices: choicesLists.roleIdentifiers,
        question: {
          message: 'Which roles do you want to deploy?'
        }
      }, {
        cmdSpec: '-e, --environment [environment]',
        description: 'An environment identifier that will be used as a prefix',
        type: 'input',
        default: 'DEV',
        question: {
          message: 'Enter an environment identifier that will be used as a prefix'
        }
      }, {
        cmdSpec: '-s, --stage [stage]',
        description: 'A stage identifier that will be used as a suffix',
        type: 'input',
        default: 'v0',
        question: {
          message: 'Enter a stage identifier that will be used as a suffix'
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
    return plugin.loadRoles()
    .then(roles => {
      // Build the list of available roles for input verification and interactive selection
      return Promise.resolve({
        roleIdentifiers: _.map(roles, role => {
          return {
            value: role.name,
            name: role.name + (role.description ? ' - ' + role.description : '')
          };
        })
      });
    });
  }

  /**
   * Deploy roles
   * @param {Object} parameters - the parameters provided in the command and in the prompt
   * @returns {Promise<null>} - The execution stops here
   */
  function executeCommand(parameters) {
    const context = {
      stage: parameters.stage,
      environment: parameters.environment
    };
    return plugin.findRoles(parameters.roleIdentifiers)
    .then((roles) => {
      return Promise.map(roles, role => { return role.deploy(context); });
    })
    .then((roles) => {
      console.log('\n    ' + icli.format.success('The following roles have been sucessfully deployed:'));
      console.log(_.map(roles, role => { return '      - ' + role.name + '\n'; }).join(''));
    })
    .catch(e => {
      if (e.code === 'AccessDeniedException' && e.cause && e.cause.message) {
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