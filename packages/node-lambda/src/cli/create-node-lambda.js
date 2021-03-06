'use strict';

const Promise = require('bluebird');
const _ = require('lodash');

const path = require('path');
const fs = Promise.promisifyAll(require('fs'));
const mkdirpAsync = Promise.promisify(require('mkdirp'));
const ncpAsync = Promise.promisify(require('ncp'));

const plugin = require('../index');

/**
 * This module exports a function that enrich the interactive command line and return a promise
 * @returns {Promise} - a promise that resolve when the operation is done
 */
module.exports = (icli) => {

  // Build the lists of choices
  return getChoices()
  .then(choicesLists => {

    const config = {
      section: 'Node Lambda plugin',
      cmd: 'create-node-lambda',
      description: 'create a new lambda',
      parameters: [{
        cmdSpec: '[identifier]',
        type: 'input',
        validate: input => { return /^[a-z0-9_-]+$/i.test(input); },
        question: {
          message: 'Choose a unique identifier for the Lambda (alphanumeric caracters, "_" and "-" accepted)'
        }
      }, {
        cmdSpec: '-t, --timeout <timeout>',
        description: 'select the timeout (in seconds)',
        type: 'integer',
        question: {
          message: 'Choose the timeout (in seconds)'
        }
      }, {
        cmdSpec: '-m, --memory <memory>>',
        description: 'select the memory (in MB)',
        type: 'list',
        choices: choicesLists.memory,
        question: {
          message: 'Choose the memory'
        }
      }, {
        cmdSpec: '--modules <modules>',
        description: 'select the modules that must be included in the Lambda',
        type: 'checkbox',
        choices: choicesLists.modules,
        question: {
          message: 'Choose the node packages that must be included in the Lambda',
          when(answers, cmdParameterValues) {
            return !cmdParameterValues.modules && choicesLists.modules && choicesLists.modules.length > 0;
          }
        }
      }, {
        cmdSpec: '-r, --role <role>',
        description: 'select the execution role',
        type: 'list',
        choices: choicesLists.roles,
        question: {
          message: 'Choose the execution role'
        }
      }, {
        type: 'input',
        question: {
          name: 'roleManually',
          message: 'Enter a valid IAM role that will be used to execute the Lambda function',
          when(answers, cmdParameterValues) {
            return !answers.role && !cmdParameterValues.role;
          }
        }
      }, {
        cmdSpec: '--template <template>',
        description: 'select an template to initialise the Lamba function (aka handler)',
        type: 'list',
        choices: choicesLists.template,
        default: choicesLists.template[0],
        question: {
          message: 'Select an template to initialise the Lamba function (aka handler)'
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
    const memoryValues = [];
    for (let i = 128; i <= 1536; i += 64) {
      memoryValues.push({ value: i.toString(), name: _.padStart(i, 4) + ' MB' });
    }
    const choicesLists = {
      memory: memoryValues,
      template: [{
        value: 'none',
        name: icli.format.info('none') + ' - Do not add an specific template to the Lambda, you will write a custom one'
      }, {
        value: 'api-endpoints',
        name: icli.format.info('api-endpoints') + ' - With this template, the Lambda will execute endpoints defined by the api-gateway plugin'
      }]
    };
    return plugin.loadModules()
    .then(modules => {
      choicesLists.modules = _.map(modules, m => {
        return {
          value: m.getName(),
          name: icli.format.info(m.getName())
        };
      });
      return choicesLists;
    })
    .then(() => {
      return plugin.lager.call('iam:getRoles', []);
    })
    .then(roles => {
      choicesLists.roles = _.map(roles, r => {
        return {
          value: r.getName(),
          name: icli.format.info(r.getName()) + ' - ' + (r.getDescription() || 'No description')
        };
      });
      choicesLists.roles.push({
        value: '',
        name: 'Enter value manually'
      });
      return choicesLists;
    });
  }

  /**
   * Create the new lambda
   * @param {Object} parameters - the parameters provided in the command and in the prompt
   * @returns {Promise<null>} - The execution stops here
   */
  function executeCommand(parameters) {
    if (!parameters.role && parameters.roleManually) {
      parameters.role = parameters.roleManually;
    }
    const configFilePath = path.join(process.cwd(), plugin.config.lambdasPath, parameters.identifier);
    return mkdirpAsync(configFilePath)
    .then(() => {
      // We create the configuration file of the Lambda
      const config = {
        params: {
          Timeout: parameters.timeout,
          MemorySize: parameters.memory,
          Role: parameters.role
        },
        includeEndpoints: parameters.template === 'api-endpoints',
        modules: parameters.modules || []
      };

      // We save the configuration in a json file
      return fs.writeFileAsync(configFilePath + path.sep + 'config.json', JSON.stringify(config, null, 2));
    })
    .then(() => {
      // We create the lambda handler
      const src = path.join(__dirname, 'templates', 'lambda.js');
      const dest = path.join(configFilePath, 'lambda.js');
      return ncpAsync(src, dest);
    })
    .then(() => {
      // We create the file executed by the handler
      const src = path.join(__dirname, 'templates', 'exec-files', parameters.template + '.js');
      const dest = path.join(configFilePath, 'exec.js');
      return ncpAsync(src, dest);
    })
    .then(() => {
      const msg = '\n  The Lambda ' + icli.format.info(parameters.identifier) + ' has been created\n\n'
                + '  Its configuration and its handler function are available in ' + icli.format.info(configFilePath) + '\n';
      console.log(msg);
    });
  }

};
