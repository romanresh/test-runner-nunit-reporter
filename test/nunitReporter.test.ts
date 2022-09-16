import { expect } from 'chai';
import { promises as fs } from 'fs';
import path from 'path';
import globby from 'globby';

import { playwrightLauncher } from '@web/test-runner-playwright';
import { TestRunnerCoreConfig } from '@web/test-runner-core';
import { runTests } from '@web/test-runner-core/test-helpers';
import { nunitReporter } from '../src/nunit-reporter';

const NON_ZERO_TIME_VALUE_REGEX = /time="((\d\.\d+)|(\d))"/g;

const DATE_VALUE_REGEX = /date="20(\d){2}-(\d){1,2}-(\d){1,2}"/g;
const TIME_VALUE_REGEX = /time="(\d){1,2}:(\d){1,2}:(\d){1,2}"/g;
const MACHINE_NAME_REGEX = /machine-name="[a-zA-Z\-0-9]+"/g;
const USER_NAME_REGEX = /user="[^"]+"/g;
const CWD_REGEX = /cwd="[^"]+"/g;
const OS_VERSION_REGEX = /os-version="[0-9\.]+"/g;
const USER_AGENT_STRING_REGEX = /"Mozilla\/5\.0 (.*)"/g;

const rootDir = path.join(__dirname, '..', '..', '..');

const normalizeOutput = (cwd: string, output: string) =>
  output
    .replace(NON_ZERO_TIME_VALUE_REGEX, 'time="<<computed>>"')
    .replace(DATE_VALUE_REGEX, 'date="<<computed>>"')
    .replace(TIME_VALUE_REGEX, 'time="<<computed>>"')
    .replace(USER_AGENT_STRING_REGEX, '"<<useragent>>"')
    .replace(MACHINE_NAME_REGEX, 'machine-name="<<computed>>"')
    .replace(USER_NAME_REGEX, 'user="<<computed>>"')
    .replace(CWD_REGEX, 'cwd="<<computed>>"')
    .replace(OS_VERSION_REGEX, 'os-version="<<computed>>"')
    // don't judge - normalizing paths for windblows
    .replace(/\/>/g, '🙈>')
    .replace(/<\//g, '<🙈')
    .replace(/\//g, path.sep)
    .replace(/🙈>/g, '/>')
    .replace(/<🙈/g, '</')
    .trimEnd();

const readNormalized = (filePath: string): Promise<string> =>
  fs.readFile(filePath, 'utf-8').then(out => normalizeOutput(rootDir, out));

function createConfig({
  files,
  reporters,
}: Partial<TestRunnerCoreConfig>): Partial<TestRunnerCoreConfig> {
  return {
    files,
    reporters,
    rootDir,
    coverageConfig: {
      report: false,
      reportDir: process.cwd(),
    },
    browserLogs: true,
    watch: false,
    browsers: [playwrightLauncher()],
  };
}

async function run(cwd: string): Promise<{ actual: string; expected: string }> {
  const files = await globby('*-test.js', { absolute: true, cwd });
  const outputPath = path.join(cwd, './test-results.xml');
  const reporters = [nunitReporter({ outputPath })];
  await runTests(createConfig({ files, reporters }), [], {
    allowFailure: true,
    reportErrors: false,
  });
  const actual = await readNormalized(outputPath);
  const expected = await readNormalized(path.join(cwd, './expected.xml'));
  return { actual, expected };
}

async function cleanupFixtures() {
  for (const file of await globby('fixtures/**/test-results.xml', {
    absolute: true,
    cwd: __dirname,
  }))
    await fs.unlink(file);
}

describe('junitReporter', function () {
  this.timeout(10000);
  after(cleanupFixtures);

  describe('for a simple case', function () {
    const fixtureDir = path.join(__dirname, 'fixtures/simple');
    it('produces expected results', async function () {
      const { actual, expected } = await run(fixtureDir);
      expect(actual).to.equal(expected);
    });
  });

  describe('for a nested suite', function () {
    const fixtureDir = path.join(__dirname, 'fixtures/nested');
    it('produces expected results', async function () {
      const { actual, expected } = await run(fixtureDir);
      expect(actual).to.equal(expected);
    });
  });

  // describe('for multiple test files', function () {
  //   const fixtureDir = path.join(__dirname, 'fixtures/multiple');
  //   it('produces expected results', async function () {
  //     const { actual, expected } = await run(fixtureDir);
  //     expect(actual).to.equal(expected);
  //   });
  // });
});
