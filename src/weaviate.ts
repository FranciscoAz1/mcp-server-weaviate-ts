import weaviate, { WeaviateClient, ApiKey } from 'weaviate-ts-client';
import { Config } from './config.js';
import { Logger } from './logger.js';

export interface WeaviateObject {
  id?: string;
  class?: string;
  properties?: Record<string, any>;
}

export interface QueryResult {
  data?: {
    Get?: Record<string, any[]>;
  };
}

export class WeaviateConnection {
  private client: WeaviateClient;
  private logger: Logger;

  constructor(config: Config, logger: Logger) {
    this.logger = logger;
    
    logger.info(`Connecting to Weaviate at ${config.weaviateScheme}://${config.weaviateHost}`);
    
    this.client = weaviate.client({
      scheme: config.weaviateScheme,
      host: config.weaviateHost,
      // Add authentication if needed
      // apiKey: new ApiKey('your-api-key'),
    });

    logger.info('Successfully connected to Weaviate');
  }

  async insertOne(collection: string, properties: Record<string, any>): Promise<WeaviateObject> {
    try {
      const obj: WeaviateObject = {
        class: collection,
        properties,
      };

      const result = await this.client.data
        .creator()
        .withClassName(collection)
        .withProperties(properties)
        .do();

      return {
        id: result.id,
        class: collection,
        properties,
      };
    } catch (error) {
      throw new Error(`Failed to insert object: ${error}`);
    }
  }

  async query(
    collection: string,
    query: string,
    targetProps: string[],
    limit: number = 3
  ): Promise<string> {
    try {
      let queryBuilder = this.client.graphql
        .get()
        .withClassName(collection)
        .withFields(targetProps.join(' '))
        .withHybrid({
          query: query,
        });

      if (limit > 0) {
        queryBuilder = queryBuilder.withLimit(limit);
      }

      const result = await queryBuilder.do();
      return JSON.stringify(result, null, 2);
    } catch (error) {
      throw new Error(`Query failed: ${error}`);
    }
  }

  async generateText(
    collection: string,
    query: string,
    targetProps: string[],
    limit: number = 3,
  ): Promise<string> {
    try {

      const generativePrompt = `Answer briefly: ${query}`;

      const queryBuilder = await this.client.graphql
        .get()
        .withClassName(collection)
        .withFields(targetProps.join(' '))
        .withHybrid({
          query: query,
        })
        .withGenerate({
          groupedTask: generativePrompt,
          groupedProperties: targetProps,
        })
        if (limit > 0) {
            queryBuilder.withLimit(limit);
        }
        const result = await queryBuilder.do();
      return JSON.stringify(result, null, 2);
    } catch (error) {
      throw new Error(`Text generation failed: ${error}`);
    }
  }

  async getClassSchema(className: string): Promise<any> {
    try {
      const schema = await this.client.schema
        .classGetter()
        .withClassName(className)
        .do();
      
      return schema;
    } catch (error) {
      throw new Error(`Failed to get class schema: ${error}`);
    }
  }

  async getSchema(): Promise<any> {
    try {
      const schema = await this.client.schema.getter().do();
      return schema;
    } catch (error) {
      throw new Error(`Failed to get schema: ${error}`);
    }
  }
}