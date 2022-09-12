import { Reporter, TestResult, TestRunFinishedArgs, TestSession } from "@web/test-runner-core";
import path from 'path';
import fs from 'fs';
import os from 'os';
import { create } from 'xmlbuilder2';
import { XMLBuilder } from "xmlbuilder2/lib/interfaces";
import { TestSuiteResult } from "@web/test-runner-core/src/test-session/TestSession";

const STACK_TRACE_UNIQUE_IDS_REGEX =
  /localhost:\d+|wtr-session-id=[\w\d]+-[\w\d]+-[\w\d]+-[\w\d]+-[\w\d]+|/g;

export interface NUnitReporterArgs {
    outputPath?: string;
    rootDir?: string;
}

class NUnitReporter implements Reporter {
    protected outputPath: string;
    protected rootDir: string;
    protected generator: NUnit2TestResultGenerator;
    constructor(config: NUnitReporterArgs) { 
        const outputPath = config.outputPath || "./test-report.xml";
        this.rootDir = process.cwd();
        this.outputPath = path.resolve(this.rootDir, outputPath);
        this.generator = new NUnit2TestResultGenerator();
    }

    onTestRunFinished(args: TestRunFinishedArgs): void {
        const dir = path.dirname(this.outputPath);
        fs.mkdirSync( dir, { recursive: true });
        const xml = this.generator.generate(args.sessions);
        fs.writeFileSync(this.outputPath, xml.toString({
            prettyPrint: true
        }));
    }
}

enum BooleanAttrValue {
    True = "True",
    False = "False"
}
enum ResultAttrValue {
    Success = "Success",
    NotRunnable = "NotRunnable",
    Error = "Error",
    Failure = "Failure"
}

class NUnit2TestResultGenerator {
    generate(sessions: TestSession[]): XMLBuilder {
        const root = create({ version: '1.0', encoding: 'utf-8', standalone: 'no' });
        const testResults = root.ele('test-results')
        const d = new Date();
        testResults.ele('environment', {
            "nunit-version": "2.5.8.0",
            "clr-version": "2.0.50727.1433",
            "os-version": os.release(),
            "platform": os.platform(),
            "cwd": process.cwd(),
            "machine-name": os.hostname(),
            "user": os.userInfo().username,
            "user-domain": os.userInfo().shell
        });
        testResults.ele('culture-info', {
            "current-culture": "en-US",
            "current-uiculture": "en-US"
        });
        const rootSuiteResults = testResults
            .ele('results');
        const state = new State();
        for(let session of sessions)
            state.merge(this.processSession(rootSuiteResults, session));
        rootSuiteResults.att({
            type: "WebTestRunner",
            name: "Web Test Runner",
            success: state.success ? BooleanAttrValue.True : BooleanAttrValue.False,
            time: "" + state.time,
            executed: BooleanAttrValue.True,
            result: state.success ? ResultAttrValue.Success : ResultAttrValue.Failure
        });
        testResults.att({
            'name': "",
            'total': state.testsCount,
            'errors': state.testsErrors,
            'failures': state.testsFailures,
            'inconclusive': state.testsInconclusive,
            'not-run': state.testsNotRun,
            'ignored': state.testsIgnored,
            'skipped': state.testsSkipped,
            'invalid': state.testsInvalid,
            'date': `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`,
            'time': `${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`
        });
        return testResults;
    }
    protected processSuite(resultsParentEle: XMLBuilder, testSuiteResult?: TestSuiteResult): State {
        const state = new State();
        if(testSuiteResult) {
            const suiteEle = resultsParentEle.ele('test-suite', {
                type: testSuiteResult.name,
                name: testSuiteResult.name,
                executed: BooleanAttrValue.True,
                asserts: '0'
            });
            const resultsEle = suiteEle.ele('results');
            for(let suite of testSuiteResult.suites)
                state.merge(this.processSuite(resultsEle, suite));
            for(let test of testSuiteResult.tests)
                state.merge(this.processTest(resultsEle, test));
            suiteEle.att(this.getSuiteElementAttributes(state));
        }
        return state;
    }
    protected processTest(resultsParentEle: XMLBuilder, test: TestResult): State {
        const testEle = resultsParentEle.ele('test-case', {
            name: test.name,
            success: test.passed ? BooleanAttrValue.True : BooleanAttrValue.False,
            time: this.getDuration(test.duration ?? 0),
            executed: test.skipped ? BooleanAttrValue.False : BooleanAttrValue.True
        });
        if(!test.passed) {
            const stack = test.error?.stack ?? '';
            const type = test.error?.name ?? (stack.match(/^\w+Error:/) ? stack.split(':')[0] : '');
            const failureEle = testEle.ele('failure');
            const message = `${type}: ${test.error?.message ?? ''}`;
            failureEle.ele('message')
                .dat(message);
            failureEle.ele('stack-trace')
                .dat(stack.replace(STACK_TRACE_UNIQUE_IDS_REGEX, ''));
        }
        return new State(test);
    }
    protected processSession(resultsParent: XMLBuilder, session: TestSession): State {
        const suite = resultsParent.ele('test-suite', {
            type: session.browser.name,
            name: `Browser - ${session.browser.name}`,
            executed: BooleanAttrValue.True,
            asserts: '0'
        });
        const results = this.processSuite(suite.ele('results'), session.testResults);
        suite.att(this.getSuiteElementAttributes(results));
        return results;
    }
    private getSuiteElementAttributes(state: State): object {
        return {
            result: state.success ? ResultAttrValue.Success : ResultAttrValue.Failure,
            success: state.success ? BooleanAttrValue.True : BooleanAttrValue.False,
            time: this.getDuration(state.time)
        };
    }
    private getDuration(time: number): string {
        return '' + time / 1000;
    }
}

class State {
    success: boolean = true;
    time: number = 0;
    testsCount: number = 0;
    testsErrors: number = 0;
    testsFailures: number = 0;
    testsInconclusive: number = 0;
    testsNotRun: number = 0;
    testsIgnored: number = 0;
    testsSkipped: number = 0;
    testsInvalid: number = 0;

    constructor(test?: TestResult) {
        if(test)
            this.register(test);
    }

    private register(test: TestResult) {
        this.time += test.duration ?? 0;
        this.testsCount++;
        if(test.skipped)
            this.testsSkipped++;
        else if(!test.passed)
            this.testsFailures++;
    }

    merge(other: State) {
        this.time += other.time;
        this.success = this.success && other.success;
        
        this.testsCount += other.testsCount;
        this.testsErrors += other.testsErrors;
        this.testsFailures += other.testsFailures;
        this.testsInconclusive += other.testsInconclusive;
        this.testsNotRun += other.testsNotRun;
        this.testsIgnored += other.testsIgnored;
        this.testsSkipped += other.testsSkipped;
        this.testsInvalid += other.testsInvalid;
    }
}

export function nunitReporter(config: NUnitReporterArgs): Reporter {
    return new NUnitReporter(config);
}