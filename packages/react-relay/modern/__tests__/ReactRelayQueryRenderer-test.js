/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @emails oncall+relay
 */

'use strict';

const React = require('React');
const ReactRelayPropTypes = require('../ReactRelayPropTypes');
const ReactRelayQueryRenderer = require('../ReactRelayQueryRenderer');
const ReactTestRenderer = require('ReactTestRenderer');

const {createMockEnvironment} = require('RelayModernMockEnvironment');
const {
  Environment,
  Network,
  RecordSource,
  Store,
  simpleClone,
  ROOT_ID,
} = require('relay-runtime');
const {ROOT_TYPE} = require('relay-runtime/store/RelayStoreUtils');

describe('ReactRelayQueryRenderer', () => {
  let TestQuery;

  let cacheConfig;
  let environment;
  let render;
  let store;
  let variables;

  const response = {
    data: {
      node: {
        __typename: 'User',
        id: '4',
        name: 'Zuck',
      },
    },
  };

  class PropsSetter extends React.Component {
    constructor() {
      super();
      this.state = {
        props: null,
      };
    }
    setProps(props) {
      this.setState({props});
    }
    render() {
      const child = React.Children.only(this.props.children);
      if (this.state.props) {
        return React.cloneElement(child, this.state.props);
      }
      return child;
    }
  }

  beforeEach(() => {
    jest.resetModules();
    expect.extend({
      toBeRendered(readyState) {
        const calls = render.mock.calls;
        expect(calls.length).toBe(1);
        expect(calls[0][0]).toEqual(readyState);
        return {pass: true};
      },
    });

    environment = createMockEnvironment();
    store = environment.getStore();
    ({TestQuery} = environment.mock.compile(
      `
      query TestQuery($id: ID = "<default>") {
        node(id: $id) {
          id
          ...TestFragment
        }
      }

      fragment TestFragment on User {
        name
      }
    `,
    ));

    render = jest.fn(() => <div />);
    variables = {id: '4'};
  });

  describe('when initialized', () => {
    it('fetches the query', () => {
      ReactTestRenderer.create(
        <ReactRelayQueryRenderer
          query={TestQuery}
          cacheConfig={cacheConfig}
          environment={environment}
          render={render}
          variables={variables}
        />,
      );
      expect(
        environment.mock.isLoading(TestQuery, variables, cacheConfig),
      ).toBe(true);
    });

    describe('when constructor fires multiple times', () => {
      it('fetches the query only once', () => {
        const fetch = jest.fn().mockReturnValue(response);
        store = new Store(new RecordSource());
        environment = new Environment({
          network: Network.create(fetch),
          store,
        });

        function Child(props) {
          // NOTE the unstable_yield method will move to the static renderer.
          // When React sync runs we need to update this.
          renderer.unstable_yield(props.children);
          return props.children;
        }

        class Example extends React.Component {
          render() {
            return (
              <React.Fragment>
                <Child>A</Child>
                <ReactRelayQueryRenderer
                  query={TestQuery}
                  cacheConfig={cacheConfig}
                  environment={environment}
                  render={render}
                  variables={variables}
                />
                <Child>B</Child>
                <Child>C</Child>
              </React.Fragment>
            );
          }
        }
        const renderer = ReactTestRenderer.create(<Example />, {
          unstable_isAsync: true,
        });

        // Flush some of the changes, but don't commit
        expect(renderer.unstable_flushThrough(['A', 'B'])).toEqual(['A', 'B']);
        expect(renderer.toJSON()).toEqual(null);

        // Interrupt with higher priority updates
        renderer.unstable_flushSync(() => {
          renderer.update(<Example />);
        });

        expect(fetch.mock.calls.length).toBe(1);
      });
    });

    it('fetches the query with default variables', () => {
      ReactTestRenderer.create(
        <ReactRelayQueryRenderer
          query={TestQuery}
          cacheConfig={cacheConfig}
          environment={environment}
          render={render}
          variables={{}}
        />,
      );
      variables = {id: '<default>'};
      expect(
        environment.mock.isLoading(TestQuery, variables, cacheConfig),
      ).toBe(true);
    });

    it('renders with a default ready state', () => {
      ReactTestRenderer.create(
        <ReactRelayQueryRenderer
          query={TestQuery}
          cacheConfig={cacheConfig}
          environment={environment}
          render={render}
          variables={variables}
        />,
      );
      expect({
        error: null,
        props: null,
        retry: null,
      }).toBeRendered();
    });

    it('if initial render set from store, skip loading state when data for query is already available', () => {
      environment.applyUpdate({
        storeUpdater: _store => {
          let root = _store.get(ROOT_ID);
          if (!root) {
            root = _store.create(ROOT_ID, ROOT_TYPE);
          }
          const user = _store.create('4', 'User');
          user.setValue('4', 'id');
          user.setValue('Zuck', 'name');
          root.setLinkedRecord(user, 'node', {id: '4'});
        },
      });

      ReactTestRenderer.create(
        <ReactRelayQueryRenderer
          query={TestQuery}
          dataFrom="STORE_THEN_NETWORK"
          environment={environment}
          render={render}
          variables={variables}
        />,
      );
      expect({
        error: null,
        props: {
          node: {
            id: '4',
            __fragments: {
              TestFragment: {},
            },
            __id: '4',
          },
        },
        retry: jasmine.any(Function),
      }).toBeRendered();
    });

    it('skip loading state when request could be resolved synchronously', () => {
      const fetch = () => response;
      store = new Store(new RecordSource());
      environment = new Environment({
        network: Network.create(fetch),
        store,
      });
      ReactTestRenderer.create(
        <ReactRelayQueryRenderer
          query={TestQuery}
          cacheConfig={cacheConfig}
          environment={environment}
          render={render}
          variables={variables}
        />,
      );
      expect({
        error: null,
        props: {
          node: {
            id: '4',
            __fragments: {
              TestFragment: {},
            },
            __id: '4',
          },
        },
        retry: jasmine.any(Function),
      }).toBeRendered();
    });

    it('skip loading state when request failed synchronously', () => {
      const error = new Error('Mock Network Error');
      const fetch = () => error;
      store = new Store(new RecordSource());
      environment = new Environment({
        network: Network.create(fetch),
        store,
      });
      ReactTestRenderer.create(
        <ReactRelayQueryRenderer
          query={TestQuery}
          cacheConfig={cacheConfig}
          environment={environment}
          render={render}
          variables={variables}
        />,
      );
      expect({
        error: error,
        props: null,
        retry: jasmine.any(Function),
      }).toBeRendered();
    });
  });

  describe('context', () => {
    let ContextGetter;
    let relayContext;

    beforeEach(() => {
      ContextGetter = class extends React.Component {
        componentDidMount() {
          relayContext = this.context.relay;
        }
        componentDidUpdate() {
          relayContext = this.context.relay;
        }
        render() {
          return <div />;
        }
      };
      ContextGetter.contextTypes = {
        relay: ReactRelayPropTypes.Relay,
      };
      render = jest.fn(() => <ContextGetter />);
    });

    it('sets an environment and variables on context', () => {
      expect.assertions(2);
      ReactTestRenderer.create(
        <ReactRelayQueryRenderer
          environment={environment}
          query={TestQuery}
          render={render}
          variables={variables}
        />,
      );
      environment.mock.resolve(TestQuery, response);

      expect(relayContext.environment).toBe(environment);
      expect(relayContext.variables).toEqual(variables);
    });

    it('sets an environment and variables on context with empty query', () => {
      variables = {foo: 'bar'};
      ReactTestRenderer.create(
        <ReactRelayQueryRenderer
          environment={environment}
          query={null}
          render={render}
          variables={variables}
        />,
      );

      expect({
        error: null,
        props: {},
        retry: null,
      }).toBeRendered();
      expect(relayContext.environment).toBe(environment);
      expect(relayContext.variables).toEqual(variables);
    });

    it('updates the context when the environment changes', () => {
      expect.assertions(3);
      const renderer = ReactTestRenderer.create(
        <PropsSetter>
          <ReactRelayQueryRenderer
            environment={environment}
            query={TestQuery}
            render={render}
            variables={variables}
          />
        </PropsSetter>,
      );
      environment.mock.resolve(TestQuery, response);
      environment = createMockEnvironment();
      const previousContext = relayContext;
      renderer.getInstance().setProps({
        environment,
        query: TestQuery,
        render,
        variables,
      });

      // Context object should be mutated (for compat with gDSFP).
      expect(relayContext).toBe(previousContext);
      expect(relayContext.environment).toBe(environment);
      expect(relayContext.variables).toEqual(variables);
    });

    it('updates the context when the query changes', () => {
      expect.assertions(3);
      const renderer = ReactTestRenderer.create(
        <PropsSetter>
          <ReactRelayQueryRenderer
            environment={environment}
            query={TestQuery}
            render={render}
            variables={variables}
          />
        </PropsSetter>,
      );
      environment.mock.resolve(TestQuery, response);
      TestQuery = {...TestQuery};
      const previousContext = relayContext;
      renderer.getInstance().setProps({
        environment,
        query: TestQuery,
        render,
        variables,
      });

      // Context object should be mutated (for compat with gDSFP).
      expect(relayContext).toBe(previousContext);
      expect(relayContext.environment).toBe(environment);
      expect(relayContext.variables).toEqual(variables);
    });

    it('updates the context when variables change', () => {
      expect.assertions(3);
      const renderer = ReactTestRenderer.create(
        <PropsSetter>
          <ReactRelayQueryRenderer
            environment={environment}
            query={TestQuery}
            render={render}
            variables={variables}
          />
        </PropsSetter>,
      );
      environment.mock.resolve(TestQuery, response);
      variables = {};
      const previousContext = relayContext;
      renderer.getInstance().setProps({
        environment,
        query: TestQuery,
        render,
        variables,
      });

      // Context object should be mutated (for compat with gDSFP).
      expect(relayContext).toBe(previousContext);
      expect(relayContext.environment).toBe(environment);
      expect(relayContext.variables).toEqual({
        id: '<default>',
      });
    });

    it('does not update the context for equivalent variables', () => {
      expect.assertions(3);
      variables = {foo: ['bar']};
      const renderer = ReactTestRenderer.create(
        <PropsSetter>
          <ReactRelayQueryRenderer
            environment={environment}
            query={TestQuery}
            render={render}
            variables={variables}
          />
        </PropsSetter>,
      );
      environment.mock.resolve(TestQuery, response);
      variables = simpleClone(variables);
      const previousContext = relayContext;
      const previousVariables = previousContext.variables;
      renderer.getInstance().setProps({
        environment,
        query: TestQuery,
        render,
        variables,
      });

      expect(relayContext).toBe(previousContext);
      expect(relayContext.environment).toBe(environment);
      expect(relayContext.variables).toBe(previousVariables);
    });
  });

  describe('when new props are received', () => {
    let renderer;

    beforeEach(() => {
      renderer = ReactTestRenderer.create(
        <PropsSetter>
          <ReactRelayQueryRenderer
            environment={environment}
            query={TestQuery}
            render={render}
            variables={variables}
          />
        </PropsSetter>,
      );
    });

    it('does not update if all props are ===', () => {
      environment.mockClear();
      render.mockClear();

      // "update" with all === props
      renderer.getInstance().setProps({
        environment,
        query: TestQuery,
        render,
        variables,
      });
      expect(environment.execute).not.toBeCalled();
      expect(render).not.toBeCalled();
    });

    it('does not update if variables are equivalent', () => {
      variables = {foo: [1]};
      renderer = ReactTestRenderer.create(
        <PropsSetter>
          <ReactRelayQueryRenderer
            environment={environment}
            query={TestQuery}
            render={render}
            variables={variables}
          />
        </PropsSetter>,
      );
      environment.mockClear();
      render.mockClear();

      // Update with equivalent variables
      variables = {foo: [1]};
      renderer.getInstance().setProps({
        environment,
        query: TestQuery,
        render,
        variables,
      });
      expect(environment.execute).not.toBeCalled();
      expect(render).not.toBeCalled();
    });

    it('updates if `render` prop changes', () => {
      const readyState = render.mock.calls[0][0];
      environment.mockClear();
      render.mockClear();

      // update with new render prop
      render = jest.fn(() => <div />);
      renderer.getInstance().setProps({
        environment,
        query: TestQuery,
        render,
        variables,
      });
      expect(readyState).toBeRendered();
      expect(environment.execute).not.toBeCalled();
    });

    it('refetches if the `environment` prop changes', () => {
      expect.assertions(4);
      environment.mock.resolve(TestQuery, {
        data: {
          node: null,
        },
      });
      render.mockClear();

      // Update with a different environment
      environment.mockClear();
      environment = createMockEnvironment();
      renderer.getInstance().setProps({
        environment,
        query: TestQuery,
        render,
        variables,
      });
      expect(
        environment.mock.isLoading(TestQuery, variables, cacheConfig),
      ).toBe(true);
      expect({
        error: null,
        props: null,
        retry: null,
      }).toBeRendered();
    });

    it('refetches if the `variables` prop changes', () => {
      expect.assertions(4);
      environment.mock.resolve(TestQuery, {
        data: {
          node: null,
        },
      });
      environment.mockClear();
      render.mockClear();

      // Update with different variables
      variables = {id: 'beast'};
      renderer.getInstance().setProps({
        environment,
        query: TestQuery,
        render,
        variables,
      });
      expect(
        environment.mock.isLoading(TestQuery, variables, cacheConfig),
      ).toBe(true);
      expect({
        error: null,
        props: null,
        retry: null,
      }).toBeRendered();
    });

    it('refetches with default values if the `variables` prop changes', () => {
      expect.assertions(4);
      environment.mock.resolve(TestQuery, {
        data: {
          node: null,
        },
      });
      environment.mockClear();
      render.mockClear();

      // Update with different variables
      variables = {}; // no `id`
      const expectedVariables = {id: '<default>'};
      renderer.getInstance().setProps({
        environment,
        query: TestQuery,
        render,
        variables,
      });
      expect(
        environment.mock.isLoading(TestQuery, expectedVariables, cacheConfig),
      ).toBe(true);
      expect({
        error: null,
        props: null,
        retry: null,
      }).toBeRendered();
    });

    it('refetches if the `query` prop changes', () => {
      expect.assertions(4);
      environment.mock.resolve(TestQuery, {
        data: {
          node: null,
        },
      });
      environment.mockClear();
      render.mockClear();

      // Update with a different query
      TestQuery = {...TestQuery};
      renderer.getInstance().setProps({
        cacheConfig,
        environment,
        query: TestQuery,
        render,
        variables,
      });
      expect(
        environment.mock.isLoading(TestQuery, variables, cacheConfig),
      ).toBe(true);
      expect({
        error: null,
        props: null,
        retry: null,
      }).toBeRendered();
    });

    it('renders if the `query` prop changes to null', () => {
      expect.assertions(7);
      environment.mock.resolve(TestQuery, {
        data: {
          node: null,
        },
      });
      const disposeHold = environment.retain.mock.dispose;
      expect(disposeHold).not.toBeCalled();
      const disposeUpdate = environment.subscribe.mock.dispose;
      expect(disposeUpdate).not.toBeCalled();

      environment.mockClear();
      render.mockClear();

      // Update with a null query
      renderer.getInstance().setProps({
        cacheConfig,
        environment,
        query: null,
        render,
        variables,
      });

      expect(disposeHold).toBeCalled();
      expect(disposeUpdate).toBeCalled();
      expect({
        error: null,
        props: {},
        retry: null,
      }).toBeRendered();
    });
  });

  describe('when the fetch fails', () => {
    beforeEach(() => {
      ReactTestRenderer.create(
        <ReactRelayQueryRenderer
          environment={environment}
          query={TestQuery}
          render={render}
          variables={variables}
        />,
      );
    });

    it('does not retain until the first response', () => {
      expect.assertions(1);
      render.mockClear();
      environment.mock.reject(TestQuery, new Error('fail'));
      expect(environment.retain).not.toBeCalled();
    });

    it('renders the error and retry', () => {
      expect.assertions(3);
      render.mockClear();
      const error = new Error('fail');
      environment.mock.reject(TestQuery, error);
      expect({
        error,
        props: null,
        retry: jasmine.any(Function),
      }).toBeRendered();
    });

    it('refetch the query if `retry`', () => {
      expect.assertions(7);
      render.mockClear();
      const error = new Error('network fails');
      environment.mock.reject(TestQuery, error);
      const readyState = render.mock.calls[0][0];
      expect(readyState.retry).not.toBe(null);

      render.mockClear();
      readyState.retry();
      expect({
        error: null,
        props: null,
        retry: null,
      }).toBeRendered();

      render.mockClear();
      environment.mock.resolve(TestQuery, response);
      expect({
        error: null,
        props: {
          node: {
            id: '4',
            __fragments: {
              TestFragment: {},
            },
            __id: '4',
          },
        },
        retry: jasmine.any(Function),
      }).toBeRendered();
    });
  });

  describe('with two identical query fetchers', () => {
    // Regression test for T32896427
    describe('when the fetch succeeds', () => {
      it('renders the query results', () => {
        const mockA = jest.fn().mockReturnValue('A');
        const mockB = jest.fn().mockReturnValue('B');
        class Example extends React.Component {
          render() {
            return (
              <React.Fragment>
                <ReactRelayQueryRenderer
                  query={TestQuery}
                  cacheConfig={cacheConfig}
                  environment={environment}
                  render={mockA}
                  variables={variables}
                />
                <ReactRelayQueryRenderer
                  query={TestQuery}
                  cacheConfig={cacheConfig}
                  environment={environment}
                  render={mockB}
                  variables={variables}
                />
              </React.Fragment>
            );
          }
        }
        const renderer = ReactTestRenderer.create(<Example />);
        expect.assertions(3);
        mockA.mockClear();
        mockB.mockClear();
        environment.mock.resolve(TestQuery, response);
        const mockACalls = mockA.mock.calls;
        const mockBCalls = mockB.mock.calls;
        expect(mockACalls).toEqual([
          [
            {
              error: null,
              props: {
                node: {
                  id: '4',
                  __fragments: {
                    TestFragment: {},
                  },
                  __id: '4',
                },
              },
              retry: jasmine.any(Function),
            },
          ],
        ]);
        expect(mockBCalls).toEqual([
          [
            {
              error: null,
              props: {
                node: {
                  id: '4',
                  __fragments: {
                    TestFragment: {},
                  },
                  __id: '4',
                },
              },
              retry: jasmine.any(Function),
            },
          ],
        ]);
        expect(renderer.toJSON()).toEqual(['A', 'B']);
      });
    });
  });

  describe('when the fetch succeeds', () => {
    beforeEach(() => {
      ReactTestRenderer.create(
        <ReactRelayQueryRenderer
          environment={environment}
          query={TestQuery}
          render={render}
          variables={variables}
        />,
      );
    });

    it('retains the result', () => {
      expect.assertions(2);
      environment.mock.resolve(TestQuery, response);
      expect(environment.retain).toBeCalled();
      expect(environment.retain.mock.dispose).not.toBeCalled();
    });

    it('publishes and notifies the store with changes', () => {
      expect.assertions(2);
      environment.mock.resolve(TestQuery, response);
      expect(store.publish).toBeCalled();
      expect(store.notify).toBeCalled();
    });

    it('renders the query results', () => {
      expect.assertions(3);
      render.mockClear();
      environment.mock.resolve(TestQuery, response);
      expect({
        error: null,
        props: {
          node: {
            id: '4',
            __fragments: {
              TestFragment: {},
            },
            __id: '4',
          },
        },
        retry: jasmine.any(Function),
      }).toBeRendered();
    });

    it('subscribes to the root fragment', () => {
      expect.assertions(4);
      environment.mock.resolve(TestQuery, response);
      expect(environment.subscribe).toBeCalled();
      expect(environment.subscribe.mock.calls[0][0].dataID).toBe('client:root');
      expect(environment.subscribe.mock.calls[0][0].node).toBe(
        TestQuery.fragment,
      );
      expect(environment.subscribe.mock.calls[0][0].variables).toEqual(
        variables,
      );
    });
  });
  describe('when props change during a fetch', () => {
    let NextQuery;
    let renderer;
    let nextProps;

    beforeEach(() => {
      ({NextQuery} = environment.mock.compile(
        `
        query NextQuery($id: ID!) {
          node(id: $id) {
            ... on User {
              name
            }
          }
        }
      `,
      ));

      variables = {id: '4'};
      renderer = ReactTestRenderer.create(
        <PropsSetter>
          <ReactRelayQueryRenderer
            environment={environment}
            query={TestQuery}
            render={render}
            variables={variables}
          />
        </PropsSetter>,
      );
      nextProps = {
        environment,
        query: NextQuery,
        render,
        variables,
      };
    });

    it('cancels the pending fetch', () => {
      const subscription = environment.execute.mock.subscriptions[0];
      expect(subscription.closed).toBe(false);
      renderer.getInstance().setProps(nextProps);
      expect(subscription.closed).toBe(true);
    });

    it('releases the pending selection', () => {
      environment.mock.resolve(TestQuery, response);
      const disposeHold = environment.retain.mock.dispose;
      expect(disposeHold).not.toBeCalled();
      renderer.getInstance().setProps(nextProps);
      environment.mock.resolve(NextQuery, response);
      expect(disposeHold).toBeCalled();
    });

    it('retains the new selection', () => {
      environment.mockClear();
      renderer.getInstance().setProps(nextProps);
      environment.mock.resolve(NextQuery, response); // trigger retain
      expect(environment.retain.mock.calls[0][0].dataID).toBe('client:root');
      expect(environment.retain.mock.calls[0][0].node).toBe(
        NextQuery.operation,
      );
      expect(environment.retain.mock.calls[0][0].variables).toEqual(variables);
    });

    it('renders a pending state', () => {
      render.mockClear();
      renderer.getInstance().setProps(nextProps);
      expect({
        error: null,
        props: null,
        retry: null,
      }).toBeRendered();
    });

    it('renders if the `query` prop changes to null', () => {
      const subscription = environment.execute.mock.subscriptions[0];
      expect(subscription.closed).toBe(false);
      environment.mock.resolve(TestQuery, response); // trigger retain
      const disposeHold = environment.retain.mock.dispose;
      expect(disposeHold).not.toBeCalled();

      environment.mockClear();
      render.mockClear();

      // Update with a null query
      renderer.getInstance().setProps({
        cacheConfig,
        environment,
        query: null,
        render,
        variables,
      });

      expect(subscription.closed).toBe(true);
      expect(disposeHold).toBeCalled();
      expect({
        error: null,
        props: {},
        retry: null,
      }).toBeRendered();
    });
  });

  describe('when props change after a fetch fails', () => {
    let NextQuery;
    let error;
    let renderer;
    let nextProps;

    beforeEach(() => {
      ({NextQuery} = environment.mock.compile(
        `
        query NextQuery($id: ID!) {
          node(id: $id) {
            ... on User {
              name
            }
          }
        }
      `,
      ));

      variables = {id: '4'};
      renderer = ReactTestRenderer.create(
        <PropsSetter>
          <ReactRelayQueryRenderer
            environment={environment}
            query={TestQuery}
            render={render}
            variables={variables}
          />
        </PropsSetter>,
      );
      error = new Error('fail');
      environment.mock.reject(TestQuery, error);
      render.mockClear();
      nextProps = {
        environment,
        query: NextQuery,
        render,
        variables,
      };
    });

    it('fetches the new query', () => {
      environment.mockClear();
      renderer.getInstance().setProps(nextProps);
      expect(
        environment.mock.isLoading(NextQuery, variables, cacheConfig),
      ).toBe(true);
    });

    it('retains the new selection', () => {
      expect.assertions(5);
      environment.mockClear();
      renderer.getInstance().setProps(nextProps);
      environment.mock.resolve(NextQuery, {
        data: {
          node: null,
        },
      });
      expect(environment.retain.mock.calls.length).toBe(1);
      expect(environment.retain.mock.calls[0][0].dataID).toBe('client:root');
      expect(environment.retain.mock.calls[0][0].node).toBe(
        NextQuery.operation,
      );
      expect(environment.retain.mock.calls[0][0].variables).toEqual(variables);
      expect(environment.retain.mock.dispose).not.toBeCalled();
    });

    it('renders the pending state', () => {
      renderer.getInstance().setProps(nextProps);
      expect({
        error: null,
        props: null,
        retry: null,
      }).toBeRendered();
    });

    it('publishes and notifies the store with changes', () => {
      expect.assertions(2);
      environment.mockClear();
      renderer.getInstance().setProps(nextProps);
      environment.mock.resolve(NextQuery, response);
      expect(store.publish).toBeCalled();
      expect(store.notify).toBeCalled();
    });
  });

  describe('when props change after a fetch succeeds', () => {
    let NextQuery;
    let renderer;
    let nextProps;

    beforeEach(() => {
      ({NextQuery} = environment.mock.compile(
        `
        query NextQuery($id: ID!) {
          node(id: $id) {
            ... on User {
              name
            }
          }
        }
      `,
      ));

      renderer = ReactTestRenderer.create(
        <PropsSetter>
          <ReactRelayQueryRenderer
            environment={environment}
            query={TestQuery}
            render={render}
            variables={variables}
          />
        </PropsSetter>,
      );
      environment.mock.resolve(TestQuery, {
        data: {
          node: {
            __typename: 'User',
            id: '4',
            name: 'Zuck',
          },
        },
      });
      render.mockClear();
      nextProps = {
        environment,
        query: NextQuery,
        render,
        variables,
      };
    });

    it('disposes the root fragment subscription', () => {
      const disposeUpdate = environment.subscribe.mock.dispose;
      expect(disposeUpdate).not.toBeCalled();
      renderer.getInstance().setProps(nextProps);
      expect(disposeUpdate).toBeCalled();
    });

    it('fetches the new query', () => {
      environment.mockClear();
      renderer.getInstance().setProps(nextProps);
      expect(
        environment.mock.isLoading(NextQuery, variables, cacheConfig),
      ).toBe(true);
    });

    it('disposes the previous selection and retains the new one', () => {
      expect.assertions(6);
      const prevDispose = environment.retain.mock.dispose;
      environment.mockClear();
      renderer.getInstance().setProps(nextProps);
      environment.mock.resolve(NextQuery, {
        data: {
          node: null,
        },
      });
      expect(environment.retain).toBeCalled();
      expect(environment.retain.mock.calls[0][0].dataID).toBe('client:root');
      expect(environment.retain.mock.calls[0][0].node).toBe(
        NextQuery.operation,
      );
      expect(environment.retain.mock.calls[0][0].variables).toEqual(variables);
      expect(prevDispose).toBeCalled();
      expect(environment.retain.mock.dispose).not.toBeCalled();
    });

    it('renders the pending and previous state', () => {
      environment.mockClear();
      renderer.getInstance().setProps(nextProps);
      expect({
        error: null,
        props: null,
        retry: null,
      }).toBeRendered();
    });

    it('publishes and notifies the store with changes', () => {
      expect.assertions(2);
      environment.mockClear();
      renderer.getInstance().setProps(nextProps);
      environment.mock.resolve(NextQuery, response);
      expect(store.publish).toBeCalled();
      expect(store.notify).toBeCalled();
    });
  });

  describe('when unmounted', () => {
    it('releases its reference if unmounted before fetch completes', () => {
      const renderer = ReactTestRenderer.create(
        <ReactRelayQueryRenderer
          environment={environment}
          query={TestQuery}
          render={render}
          variables={variables}
        />,
      );
      expect(environment.retain).not.toBeCalled();
      renderer.unmount();
      expect(environment.retain).not.toBeCalled();
    });

    it('releases its reference if unmounted after fetch completes', () => {
      const renderer = ReactTestRenderer.create(
        <ReactRelayQueryRenderer
          environment={environment}
          query={TestQuery}
          render={render}
          variables={variables}
        />,
      );
      environment.mock.resolve(TestQuery, response);
      const dispose = environment.retain.mock.dispose;
      expect(dispose).not.toBeCalled();
      renderer.unmount();
      expect(dispose).toBeCalled();
    });

    it('aborts a pending fetch', () => {
      const renderer = ReactTestRenderer.create(
        <ReactRelayQueryRenderer
          environment={environment}
          query={TestQuery}
          render={render}
          variables={variables}
        />,
      );
      const subscription = environment.execute.mock.subscriptions[0];
      expect(subscription.closed).toBe(false);
      renderer.unmount();
      expect(subscription.closed).toBe(true);
    });
  });

  describe('multiple payloads', () => {
    let NextQuery;
    let renderer;
    let nextProps;

    beforeEach(() => {
      ({NextQuery} = environment.mock.compile(
        `
        query NextQuery($id: ID!) {
          node(id: $id) {
            ... on User {
              name
            }
          }
        }
      `,
      ));

      renderer = ReactTestRenderer.create(
        <PropsSetter>
          <ReactRelayQueryRenderer
            environment={environment}
            query={TestQuery}
            render={render}
            variables={variables}
          />
        </PropsSetter>,
      );
      nextProps = {
        environment,
        query: NextQuery,
        render,
        variables,
      };
    });

    it('retains partially fulfilled results until next succesful request', () => {
      environment.mock.nextValue(TestQuery, response);
      const disposeHold = environment.retain.mock.dispose;
      expect(environment.retain).toBeCalled();
      expect(disposeHold).not.toBeCalled();
      environment.mock.reject(TestQuery, new Error('fail'));
      expect(disposeHold).not.toBeCalled();
      renderer.getInstance().setProps(nextProps);
      expect(disposeHold).not.toBeCalled();
      environment.mock.resolve(NextQuery, response);
      expect(disposeHold).toBeCalled();
    });
  });

  describe('async', () => {
    // Verify the component doesn't leak references if it doesn't finish mount.
    // @TODO T28041408 Test aborted mount using unstable_flushSync() rather than
    // throwing once the test renderer exposes such a method.
    it('should ignore data changes before mount', () => {
      class ErrorBoundary extends React.Component {
        state = {error: null};
        componentDidCatch(error) {
          this.setState({error});
        }
        render() {
          return this.state.error === null ? this.props.children : null;
        }
      }

      render.mockImplementation(({props}) => {
        const error = Error('Make mount fail intentionally');
        // Don't clutter the test console with React's error log
        error.suppressReactErrorLogging = true;
        throw error;
      });

      ReactTestRenderer.create(
        <ErrorBoundary>
          <ReactRelayQueryRenderer
            environment={environment}
            query={TestQuery}
            render={render}
            variables={variables}
          />
        </ErrorBoundary>,
      );

      environment.mock.resolve(TestQuery, {
        data: {
          node: {
            __typename: 'User',
            id: '4',
            name: 'Zuck',
          },
        },
      });

      expect(render.mock.calls).toHaveLength(1);
    });
  });
});
