/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict-local
 * @format
 */

'use strict';

const crypto = require('crypto');
const invariant = require('invariant');

const {RelayConcreteNode} = require('relay-runtime');

import type {GeneratedNode} from 'relay-runtime';

async function persistGeneratedNode(
  generatedNode: GeneratedNode,
  devOnlyProperties: {[string]: mixed},
  persistQuery: (text: string, id: string) => Promise<string>,
): Promise<GeneratedNode> {
  switch (generatedNode.kind) {
    case RelayConcreteNode.REQUEST:
      const {text} = generatedNode.params;
      invariant(
        text != null,
        'writeRelayGeneratedFile: Expected `text` in order to persist query',
      );

      devOnlyProperties.params = {text};

      const persistedIdHasher = crypto.createHash('md5');
      persistedIdHasher.update(text);
      const persistedId = persistedIdHasher.digest('hex');

      return {
        ...generatedNode,
        params: {
          operationKind: generatedNode.params.operationKind,
          name: generatedNode.params.name,
          id: await persistQuery(text, persistedId),
          text: null,
          metadata: generatedNode.params.metadata,
        },
      };
    default:
      // Do not persist fragments or other types of nodes.
      return generatedNode;
  }
}

module.exports = persistGeneratedNode;