import { assert } from 'chai';
import { join } from 'path';
import fs from 'fs';
import { exec, execFile } from 'child_process';
import { GsfServer, ScrapingSuite } from '@get-set-fetch/test-utils';
import Project from '../../../src/storage/base/Project';
import { pipelines, mergePluginOpts } from '../../../src/pipelines/pipelines';
import { completionPercentage } from '../../../src/cli/cli';
import { ConnectionManager } from '../../../src';

describe('Command Line Interface', () => {
  let srv: GsfServer;
  let ExtProject: typeof Project;
  let connMng: ConnectionManager;
  let config;

  before(async () => {
    // do some file cleanup on tmp dir containing export files
    fs.readdirSync(join(__dirname, '..', '..', 'tmp')).forEach(file => {
      if (file !== '.gitkeep') {
        fs.unlinkSync(join(__dirname, '..', '..', 'tmp', file));
      }
    });

    /*
    init storage, ALL config files db settings point to the same sqlite db: test/tmp/db.sqlite
    we need a storage instance for cleaning up the db and adding projects before invoking cli
    */
    config = JSON.parse(fs.readFileSync(join(__dirname, 'config', 'config-single-page-single-content-entry.json')).toString('utf-8'));
    config.storage.connection.filename = join(__dirname, 'config', config.storage.connection.filename);

    connMng = new ConnectionManager(config.storage);
    await connMng.connect();
    ExtProject = await connMng.getProject();

    // init gsf web server
    const test = ScrapingSuite.getTests().find(test => test.title === 'Static - Single Page - Single Content Entry');
    srv = new GsfServer();
    srv.start();
    srv.update(test.vhosts);
  });

  beforeEach(async () => {
    await ExtProject.delAll();
  });

  after(async () => {
    await connMng.close();
    srv.stop();
  });

  it('--version', async () => {
    const packageFile = fs.readFileSync(join(__dirname, '../../../package.json')).toString('utf-8');
    const { version } = JSON.parse(packageFile);

    const stdout = await new Promise<string>(resolve => exec(
      './gsfscrape --version',
      { cwd: join(__dirname, '../../../bin') },
      (err, stdout) => resolve(stdout.trim()),
    ));
    assert.strictEqual(stdout, `@get-set-fetch/scraper - v${version}`);
  });

  it('new project --config --loglevel error --scrape', async () => {
    const stdout = await new Promise<string>(resolve => exec(
      './gsfscrape --config ../test/acceptance/cli/config/config-single-page-single-content-entry.json --loglevel error --scrape',
      { cwd: join(__dirname, '../../../bin') },
      (err, stdout) => {
        resolve(stdout);
      },
    ));

    const lastLine = stdout.split('/n').pop().trim();
    assert.isTrue(/using sqlite file/.test(lastLine), 'last stdout line should mention sqlite file');
  });

  it('new project --config --loglevel info --logdestination --scrape', async () => {
    const stdout = await new Promise<string>(resolve => exec(
      './gsfscrape --config ../test/acceptance/cli/config/config-single-page-single-content-entry.json --loglevel info --logdestination ../test/tmp/scrape.log --scrape',
      { cwd: join(__dirname, '../../../bin') },
      (err, stdout) => {
        resolve(stdout);
      },
    ));

    const lastLine = stdout.split('/n').pop().trim();
    assert.isTrue(/using sqlite file/.test(lastLine), 'last stdout line should mention sqlite file');

    const logContent = fs.readFileSync(join(__dirname, '../../tmp/scrape.log')).toString('utf-8');

    // check new project was created
    assert.isTrue(/New project sitea.com saved/.test(logContent), '"new project saved" log entry not found');

    // check resource was scraped
    assert.isTrue(/Resource http:\/\/sitea.com\/index.html successfully scraped/.test(logContent), '"resource successfully scraped" log entry not found');

    // check project scraping is complete
    assert.isTrue(/Project sitea.com scraping complete/.test(logContent), '"project scraping complete" log entry not found');
  });

  it('new project --config --loglevel info --scrape --report 10', async () => {
    const stdout = await new Promise<string>(resolve => exec(
      './gsfscrape --config ../test/acceptance/cli/config/config-single-page-single-content-entry.json --loglevel info --scrape --report 10',
      { cwd: join(__dirname, '../../../bin') },
      (err, stdout) => {
        resolve(stdout);
      },
    ));

    // check new project was created
    assert.isTrue(/New project sitea.com saved/.test(stdout), '"new project saved" log entry not found');

    // check resource was scraped
    assert.isTrue(/Resource http:\/\/sitea.com\/index.html successfully scraped/.test(stdout), '"resource successfully scraped" log entry not found');

    // check scraping status
    assert.isTrue(/progress \(scraped \/ total resources\): 1 \/ 1 \| 100%/.test(stdout), '"Scrape progress ... 100%" log entry not found');

    // check project scraping is complete
    assert.isTrue(/Project sitea.com scraping complete/.test(stdout), '"project scraping complete" log entry not found');
  });

  it('existing project --config --loglevel info --scrape --overwrite', async () => {
    const project = new ExtProject({
      name: 'sitea.com',
      pluginOpts: mergePluginOpts(pipelines[config.project.pipeline].defaultPluginOpts, config.project.pluginOpts),
    });
    await project.save();
    await project.queue.normalizeAndAdd(config.project.resources);

    const stdout = await new Promise<string>(resolve => exec(
      './gsfscrape --config ../test/acceptance/cli/config/config-single-page-single-content-entry.json --loglevel info --scrape --overwrite',
      { cwd: join(__dirname, '../../../bin') },
      (err, stdout) => {
        resolve(stdout);
      },
    ));

    assert.isTrue(/Overwriting project sitea.com/.test(stdout), '"Overwriting project sitea.com" log entry not found');
  });

  it('existing project --config --loglevel info --scrape --overwrite false', async () => {
    const project = new ExtProject({
      name: 'sitea.com',
      pluginOpts: mergePluginOpts(pipelines[config.project.pipeline].defaultPluginOpts, config.project.pluginOpts),
    });
    await project.save();
    await project.queue.normalizeAndAdd(config.project.resources);

    // by default overwrite is false, just make sure --overwrite flag is not present
    const stdout = await new Promise<string>(resolve => exec(
      './gsfscrape --config ../test/acceptance/cli/config/config-single-page-single-content-entry.json --loglevel info --scrape',
      { cwd: join(__dirname, '../../../bin') },
      (err, stdout) => {
        resolve(stdout);
      },
    ));

    assert.isTrue(/Existing project sitea.com will be used/.test(stdout), '"Existing project sitea.com will be used" log entry not found');
  });

  it('new project --config --loglevel info --scrape --export', async () => {
    const stdout = await new Promise<string>(resolve => exec(
      './gsfscrape --config ../test/acceptance/cli/config/config-single-page-single-content-entry.json --loglevel info --scrape --export ../test/tmp/export.csv',
      { cwd: join(__dirname, '../../../bin') },
      (err, stdout) => {
        resolve(stdout);
      },
    ));

    assert.isTrue(/scraped data will be exported to/.test(stdout), '"scraped data will be exported to" log entry not found');
    assert.isTrue(/export.csv .+ done/.test(stdout), '"export.csv done" log entry not found');

    const csvContent:string[] = fs.readFileSync(join(__dirname, '..', '..', 'tmp', 'export.csv')).toString('utf-8').split('\n');
    assert.sameOrderedMembers(
      [
        'url,h1',
        'http://sitea.com/index.html,"Main Header 1"',
      ],
      csvContent,
    );
  });

  it('new project with custom plugin --config --loglevel debug --scrape --export', async () => {
    const stdout = await new Promise<string>(resolve => exec(
      './gsfscrape --config ../test/acceptance/cli/config/config-single-page-single-content-entry-custom-plugin.json --loglevel info --scrape --export ../test/tmp/export.csv',
      { cwd: join(__dirname, '../../../bin') },
      (err, stdout) => {
        resolve(stdout);
      },
    ));

    assert.isTrue(/scraped data will be exported to/.test(stdout), '"scraped data will be exported to" log entry not found');
    assert.isTrue(/export.csv .+ done/.test(stdout), '"export.csv done" log entry not found');

    const csvContent:string[] = fs.readFileSync(join(__dirname, '..', '..', 'tmp', 'export.csv')).toString('utf-8').split('\n');
    assert.sameOrderedMembers(
      [
        'url,h1,h1Length',
        'http://sitea.com/index.html,"Main Header 1",23',
      ],
      csvContent,
    );
  });

  it('new project --config --loglevel info --export missing --exportType', async () => {
    const { stdout, stderr } = await new Promise<{stdout: string, stderr: string}>(resolve => exec(
      './gsfscrape --config ../test/acceptance/cli/config/config-single-page-single-content-entry.json --loglevel info --export ../test/tmp/export.txt',
      { cwd: join(__dirname, '../../../bin') },
      (err, stdout, stderr) => {
        resolve({ stdout, stderr });
      },
    ));

    assert.isTrue(/scraped data will be exported to/.test(stdout), '"scraped data will be exported to" log entry not found');
    assert.isTrue(/missing or invalid --exportType/.test(stderr), '"missing or invalid --exportType" log entry not found');
  });

  it('new project --save --discover --retry 1 --loglevel info | SIGTERM', async () => {
    const { stdout, stderr } = await new Promise<{stdout: string, stderr: string}>(resolve => {
      const childProcess = execFile(
        './gsfscrape',
        [
          '--config', '../test/acceptance/cli/config/config-single-page-single-content-entry.json',
          '--save', '--discover', '--retry', '1', '--loglevel', 'info',
        ],
        {
          cwd: join(__dirname, '../../../bin'),
        },
        (err, stdout, stderr) => {
          resolve({ stdout, stderr });
        },
      );

      const debug = false;

      if (debug) {
        childProcess.stdout.on('data', data => {
          console.log(`stdout:${data}`);
        });

        childProcess.stderr.on('data', data => {
          console.log(`stderr:${data}`);
        });
      }

      /*
      keep cli in a discovery loop for ~1 min (mocha timeout is set at 55s, don't exceed that)
      this way we may find memory leaks reflected in stderr
      "MaxListenersExceededWarning: Possible EventEmitter memory leak detected" was found this way
      */
      setTimeout(() => {
        childProcess.kill('SIGTERM');
      }, 50 * 1000);
    });

    if (stderr) {
      console.log(stderr);
      throw new Error('error encountered during discover loop');
    }

    const discoverEntryCount = (stdout.match(/Discovering new project/g) || []).length;
    assert.isTrue(discoverEntryCount > 45);

    assert.isTrue(/index\.html successfully scraped/.test(stdout), '"index.html successfully scraped" log entry not found');
    assert.isTrue(/Project sitea\.com scraping complete/.test(stdout), '"Project sitea.com scraping complete" log entry not found');
    assert.isTrue(/SIGTERM signal received/.test(stdout), '"signal received" log entry not found');
    assert.isTrue(/no in-progress scraping detected/.test(stdout), '"no in-progress scraping detected" log entry not found');
  });

  it('existing projects --discover --loglevel info --export', async () => {
    const projectA = new ExtProject({
      name: 'projectA',
      pluginOpts: mergePluginOpts(pipelines[config.project.pipeline].defaultPluginOpts, config.project.pluginOpts),
    });
    await projectA.save();
    await projectA.queue.normalizeAndAdd(config.project.resources);

    const projectB = new ExtProject({
      name: 'projectB',
      pluginOpts: mergePluginOpts(pipelines[config.project.pipeline].defaultPluginOpts, config.project.pluginOpts),
    });
    await projectB.save();
    await projectB.queue.normalizeAndAdd(config.project.resources);

    const stdout = await new Promise<string>(resolve => exec(
      './gsfscrape --config ../test/acceptance/cli/config/config-single-page-single-content-entry.json --discover --loglevel info --export ../test/tmp/export.csv',
      { cwd: join(__dirname, '../../../bin') },
      (err, stdout) => {
        resolve(stdout);
      },
    ));

    assert.isTrue(/export-projectA.csv .+ done/.test(stdout), '"export-projectA.csv done" log entry not found');
    assert.isTrue(/export-projectB.csv .+ done/.test(stdout), '"export-projectB.csv done" log entry not found');

    const csvContentA:string[] = fs.readFileSync(join(__dirname, '..', '..', 'tmp', 'export-projectA.csv')).toString('utf-8').split('\n');
    const csvContentB:string[] = fs.readFileSync(join(__dirname, '..', '..', 'tmp', 'export-projectB.csv')).toString('utf-8').split('\n');
    const expectedContent = [
      'url,h1',
      'http://sitea.com/index.html,"Main Header 1"',
    ];

    assert.sameOrderedMembers(expectedContent, csvContentA);
    assert.sameOrderedMembers(expectedContent, csvContentB);
  });

  it('new project with invalid relative resources path', async () => {
    const { stderr } = await new Promise<{stderr: string, stdout: string}>(resolve => exec(
      './gsfscrape --config ../test/acceptance/cli/config/config-with-invalid-external-resources.json',
      { cwd: join(__dirname, '../../../bin') },
      (err, stdout, stderr) => {
        resolve({ stdout, stderr });
      },
    ));

    assert.isTrue(/non-existent-resources\.csv does not exist/.test(stderr), '"non-existent-resources.csv does not exist" log entry not found');
  });

  it('new project with invalid relative config path', async () => {
    const { stderr } = await new Promise<{stderr: string, stdout: string}>(resolve => exec(
      './gsfscrape --config config.json',
      { cwd: join(__dirname, '../../../bin') },
      (err, stdout, stderr) => {
        resolve({ stdout, stderr });
      },
    ));

    assert.isTrue(/config\.json does not exist/.test(stderr), '"config.json does not exist" log entry not found');
  });

  it('new project with invalid absolute config path', async () => {
    const { stderr } = await new Promise<{stderr: string, stdout: string}>(resolve => exec(
      './gsfscrape --config /home/config.json',
      { cwd: join(__dirname, '../../../bin') },
      (err, stdout, stderr) => {
        resolve({ stdout, stderr });
      },
    ));

    assert.isTrue(/\/home\/config\.json does not exist/.test(stderr), '"home/config.json does not exist" log entry not found');
  });

  it('new project with invalid relative logdestination path', async () => {
    const { stderr } = await new Promise<{stderr: string, stdout: string}>(resolve => exec(
      './gsfscrape --config ../test/acceptance/cli/config/config-with-external-resources.json --logdestination dirA/scraper.log',
      { cwd: join(__dirname, '../../../bin') },
      (err, stdout, stderr) => {
        resolve({ stdout, stderr });
      },
    ));

    assert.isTrue(/dirA does not exist/.test(stderr), '"log dirpath does not exist" log entry not found');
  });

  it('new project with invalid absolute logdestination path', async () => {
    const { stderr } = await new Promise<{stderr: string, stdout: string}>(resolve => exec(
      './gsfscrape --config ../test/acceptance/cli/config/config-with-external-resources.json --logdestination /home/dirA/scraper.log',
      { cwd: join(__dirname, '../../../bin') },
      (err, stdout, stderr) => {
        resolve({ stdout, stderr });
      },
    ));

    assert.isTrue(/\/home\/dirA does not exist/.test(stderr), '"log dirpath does not exist" log entry not found');
  });

  it('new project with external resources --scrape --report --loglevel info --export', async () => {
    const { stdout } = await new Promise<{stderr: string, stdout: string}>(resolve => exec(
      './gsfscrape --config ../test/acceptance/cli/config/config-with-external-resources.json --loglevel info --scrape --report 10 --export ../test/tmp/export.csv',
      { cwd: join(__dirname, '../../../bin') },
      (err, stdout, stderr) => {
        resolve({ stdout, stderr });
      },
    ));

    assert.isTrue(/3 total resources inserted/.test(stdout), '"3 total resources inserted" log entry not found');
    assert.isTrue(/inserting resources from .+resources.csv done/.test(stdout), '"inserting resources from .. resource.csv done" log entry not found');

    assert.isTrue(/index.html successfully scraped/.test(stdout), '"index.html successfully scraped" log entry not found');
    assert.isTrue(/other1.html successfully scraped/.test(stdout), '"other1.html successfully scraped" log entry not found');
    assert.isTrue(/other2.html successfully scraped/.test(stdout), '"other2.html successfully scraped" log entry not found');
    assert.isTrue(/other3.html successfully scraped/.test(stdout), '"other3.html successfully scraped" log entry not found');
    assert.isTrue(/Project sitea.com scraping complete/.test(stdout), '"project scraping complete" log entry not found');

    // check scraping status
    assert.isTrue(/progress \(scraped \/ total resources\): 1 \/ 4 \| 25%/.test(stdout), '"Scrape progress ... 25%" log entry not found');

    const csvContent:string[] = fs.readFileSync(join(__dirname, '..', '..', 'tmp', 'export.csv')).toString('utf-8').split('\n');

    // a single valid entry since otherN.html pages have null content
    const expectedContent = [
      'url,h1',
      'http://sitea.com/index.html,"Main Header 1"',
    ];

    assert.sameOrderedMembers(expectedContent, csvContent);
  });

  it('new project --save --loglevel info', async () => {
    const stdout = await new Promise<string>(resolve => exec(
      './gsfscrape --config ../test/acceptance/cli/config/config-single-page-single-content-entry.json --save --loglevel info',
      { cwd: join(__dirname, '../../../bin') },
      (err, stdout) => {
        resolve(stdout);
      },
    ));

    assert.isTrue(/New project sitea.com saved/.test(stdout), '"New project sitea.com saved" log entry not found');
  });

  it('completionPercentage', async () => {
    assert.strictEqual(completionPercentage(1, 1), 100);
    assert.strictEqual(completionPercentage(3, 4), 75);
    assert.strictEqual(completionPercentage(1, 3), 33.33);
    assert.strictEqual(completionPercentage(0, 1), 0);
  });
});
