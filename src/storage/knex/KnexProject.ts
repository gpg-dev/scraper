/* eslint-disable no-await-in-loop */
import Project, { IProjectStorage } from '../base/Project';
import KnexStorage from './KnexStorage';

export default class KnexProject extends KnexStorage implements IProjectStorage {
  get builder() {
    return this.knex('projects');
  }

  async init():Promise<void> {
    const schemaBuilder = this.knex.schema;
    const tablePresent = await schemaBuilder.hasTable('projects');
    if (tablePresent) return;

    await schemaBuilder.createTable(
      'projects',
      builder => {
        builder.increments('id').primary();
        builder.string('name').unique();

        this.jsonCol(builder, 'pluginOpts');
      },
    );
  }

  async get(nameOrId: number | string) {
    const colName = Number.isInteger(nameOrId) ? 'id' : 'name';
    return this.builder.where({ [colName]: nameOrId }).first();
  }

  async save(project:Project):Promise<number> {
    // save the project
    const result:number[] = await (
      this.capabilities.returning
        ? this.builder.insert(this.toJSON(project)).returning('id')
        : this.builder.insert(this.toJSON(project))
    );
    const [ id ] = result;

    return id;
  }

  update(project: Project):Promise<void> {
    return this.builder.where('id', project.id).update(this.toJSON(project));
  }
}
