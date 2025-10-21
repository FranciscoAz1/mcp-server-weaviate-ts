#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testMCPServer() {
  console.log('Testing MCP Server...');

  // Start the server
  const serverProcess = spawn('node', [join(__dirname, '..', 'dist', 'main.js')], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      // Force stdio so the test can talk JSON-RPC over stdin/stdout regardless of the user's env
      MCP_TRANSPORT: 'stdio',
      // Optional: increase verbosity if needed
      // MCP_LOG_LEVEL: 'debug',
    },
  });

  let nextRequestId = 1;

  const handshakeMessages = [
    {
      jsonrpc: '2.0',
      id: 0,
      method: 'initialize',
      params: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {
          tools: { listChanged: true },
          resources: { listChanged: true }
        },
        clientInfo: {
          name: 'weaviate-mcp-test',
          version: '0.0.1'
        }
      }
    },
    {
      jsonrpc: '2.0',
      method: 'initialized',
      params: {}
    }
  ];

  const testRequests = [
    {
      jsonrpc: '2.0',
      id: nextRequestId++,
      method: 'tools/list',
      params: {}
    },
    {
      jsonrpc: '2.0',
      id: nextRequestId++,
      method: 'resources/list',
      params: {}
    },
    {
      jsonrpc: '2.0',
      id: nextRequestId++,
      method: 'tools/call',
      params: {
        name: 'weaviate-query',
        arguments: {
          query: 'hello',
          collection: 'Dataset',
          targetProperties: ['text', 'file_path'],
          limit: 1
        }
      }
    },
    // Negative test: invalid collection to ensure we get a proper error response and the list of available collections
    {
      jsonrpc: '2.0',
      id: nextRequestId++,
      method: 'tools/call',
      params: {
        name: 'weaviate-query',
        arguments: {
          query: 'show me something',
          collection: 'NonExistentCollection',
          targetProperties: ['text'],
          limit: 1
        }
      }
    },
    // {
    //   jsonrpc: '2.0',
    //   id: nextRequestId++,
    //   method: 'tools/call',
    //   params: {
    //     name: 'weaviate-generate-text',
    //     arguments: {
    //       query: 'hello',
    //       collection: 'Dataset',
    //       targetProperties: ['text', 'file_path'],
    //       limit: 1
    //     }
    //   }
    // },
    // {
    //   jsonrpc: '2.0',
    //   id: nextRequestId++,
    //   method: 'tools/call',
    //   params: {
    //     name: 'weaviate-generate-text',
    //     arguments: {
    //       query: 'hello',
    //       collection: 'Dataset',
    //       targetProperties: ['text', 'file_path'],
    //       limit: 1
    //     }
    //   }
    // }
  ];

  const messagesToSend = [...handshakeMessages, ...testRequests];

  for (const message of messagesToSend) {
    console.log(`\nSending: ${JSON.stringify(message)}`);
    serverProcess.stdin.write(JSON.stringify(message) + '\n');
  }

  // Listen for responses
  const expectedResponseIds = new Set(testRequests.filter((msg) => typeof msg.id === 'number').map((msg) => msg.id));
  expectedResponseIds.add(0); // initialize response

  serverProcess.stdout.on('data', (data) => {
    const responses = data.toString().trim().split('\n');
    for (const response of responses) {
      if (response) {
        console.log(`Response: ${response}`);
        try {
          const parsed = JSON.parse(response);
          if (parsed.id !== undefined) {
            expectedResponseIds.delete(parsed.id);
          }
        } catch (error) {
          console.error('Failed to parse response JSON', error);
        }

        if (expectedResponseIds.size === 0) {
          console.log('\nTest completed successfully!');
          serverProcess.kill();
          process.exit(0);
        }
      }
    }
  });

  serverProcess.stderr.on('data', (data) => {
    console.log(`Server log: ${data.toString()}`);
  });

  serverProcess.on('close', (code) => {
    console.log(`Server process exited with code ${code}`);
  });

  // Timeout after 100 seconds
  setTimeout(() => {
    console.log('Test timeout - killing server');
    serverProcess.kill();
    process.exit(1);
  }, 100000);
}

testMCPServer().catch(console.error);