let thisHook = sails.hooks.jblast;

import _ from 'lodash'
import Marlinspike from 'marlinspike'

if (!thisHook) {
  class Hook extends Marlinspike {

    constructor(sails) {
      super(sails, module)
    }

    defaults (overrides) {
      // http://sailsjs.org/documentation/concepts/extending-sails/hooks/hook-specification/defaults#?using-defaults-as-a-function
    }

    configure () {
      // this.sails = sails
      // http://sailsjs.org/documentation/concepts/extending-sails/hooks/hook-specification/configure
    }

    initialize (next) {
      // http://sailsjs.org/documentation/concepts/extending-sails/hooks/hook-specification/initialize
    }

    routes () {
      return {
        // http://sailsjs.org/documentation/concepts/extending-sails/hooks/hook-specification/routes
      }
    }
}
  }

  thisHook = Marlinspike.createSailsHook(Hook)
}

export default thisHook;