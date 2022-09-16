import { Reporter, TestResult, TestResultError, TestRunFinishedArgs, TestSession } from "@web/test-runner-core";
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
        const xml = this.generator.generate(args.sessions, this.rootDir);
        const xmlString = xml.end({
            prettyPrint: true,
            headless: false,
            format: 'xml'
        });
        fs.writeFileSync(this.outputPath, xmlString);
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
    generate(sessions: TestSession[], rootDir: string): XMLBuilder {
        const root = create({ version: '1.0', encoding: 'utf-8', standalone: false });
        const testResultsEle = root.ele('test-results');
        this.createEnvEle(testResultsEle);
        this.createCultureEle(testResultsEle);
        
        const state = this.createSuiteEle(testResultsEle, "WebTestRunner", "Web Test Runner", 
            (resultsEle, state) => sessions.forEach(s => state.merge(this.processSession(resultsEle, s, rootDir)))
        );

        const d = new Date();
        testResultsEle.att({
            'name': "Web Test Runner tests",
            'total': state.testsCount,
            'errors': state.testsErrors,
            'failures': state.testsFailures,
            'not-run': state.testsNotRun,
            'inconclusive': state.testsInconclusive,
            'ignored': state.testsIgnored,
            'skipped': state.testsSkipped,
            'invalid': state.testsInvalid,
            'date': `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`,
            'time': `${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`
        });
        return testResultsEle;
    }
    protected createEnvEle(parent: XMLBuilder) {
        parent.ele('environment', {
            "nunit-version": "2.5.8.0",
            "clr-version": "2.0.50727.1433",
            "os-version": os.release(),
            "platform": os.platform(),
            "cwd": process.cwd(),
            "machine-name": os.hostname(),
            "user": os.userInfo().username,
            "user-domain": os.userInfo().shell
        });
    }
    protected createCultureEle(parent: XMLBuilder) {
        parent.ele('culture-info', {
            "current-culture": "en-US",
            "current-uiculture": "en-US"
        });
    }
    protected createSuiteEle(parent: XMLBuilder, type: string, name: string, processChildren: (resultsEle: XMLBuilder, state: State) => void, processError?: (suiteEle: XMLBuilder) => void): State {
        const suiteEle = parent.ele('test-suite', {
            type,
            name
        });
        const resultsEle = suiteEle.ele('results');
        const state = new State();
        processChildren(resultsEle, state);
        suiteEle.att({
            executed: state.testsCount - state.testsSkipped ? BooleanAttrValue.True : BooleanAttrValue.False,
            result: state.testsCount - state.testsSkipped === 0 ? ResultAttrValue.NotRunnable : (state.success ? ResultAttrValue.Success : ResultAttrValue.Failure),
            success: state.success ? BooleanAttrValue.True : BooleanAttrValue.False,
            time: this.getDuration(state.time),
            asserts: 0
        });
        processError && processError(suiteEle);
        return state;
    }
    protected processSuite(parentEle: XMLBuilder, testSuiteResult: TestSuiteResult): State {
        return this.createSuiteEle(parentEle, 
            testSuiteResult.name.replace(/\s/g, '_'), 
            testSuiteResult.name, 
            (resultsEle, state) => {
                for(let suite of testSuiteResult.suites)
                    state.merge(this.processSuite(resultsEle, suite));
                for(let test of testSuiteResult.tests)
                    state.merge(this.processTest(resultsEle, test));
            }
        );
    }
    protected processTest(resultsParentEle: XMLBuilder, test: TestResult): State {
        const testEle = resultsParentEle.ele('test-case', {
            name: test.name,
            executed: test.skipped ? BooleanAttrValue.False : BooleanAttrValue.True,
            result: test.passed ? ResultAttrValue.Success : (test.skipped ? ResultAttrValue.NotRunnable : ResultAttrValue.Failure),
            success: test.passed ? BooleanAttrValue.True : BooleanAttrValue.False,
            time: this.getDuration(test.duration ?? 0),
        });
        if(!test.passed && !test.skipped) {
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
    protected processSession(resultsEle: XMLBuilder, session: TestSession, rootDir: string): State {
        const fileName = session.testFile.replace(rootDir, '');
        return this.createSuiteEle(resultsEle, 
            `${session.browser.type}_${fileName}`, 
            `${session.browser.name}_${session.browser.type}_${fileName}`, 
            (resEle, s) => {
                if(session.testResults) {
                    session.testResults.suites.forEach((suite) => s.merge(this.processSuite(resEle, suite)));
                    session.testResults.tests.forEach((test) => s.merge(this.processTest(resEle, test)));
                }
            },
            (suiteEle) => {
                session.errors.forEach(err => this.createErrorEle(suiteEle, err));
                session.request404s.forEach(err => this.createErrorEle(suiteEle, err));
            });
    }
    protected createErrorEle(parent: XMLBuilder, error: TestResultError | string) {
        const failureEle = parent.ele('failure');
        if(typeof error === 'string')
            failureEle.ele('message').dat(error);
        else {
            const stack = error.stack ?? '';
            const type = error.name ?? (stack.match(/^\w+Error:/) ? stack.split(':')[0] : '');
            const message = `${type}: ${error.message ?? ''}`;
            failureEle.ele('message')
                .dat(message);
            if(stack) {
                failureEle.ele('stack-trace')
                    .dat(stack.replace(STACK_TRACE_UNIQUE_IDS_REGEX, ''));
            }
        }
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
    asserts: number = 0;

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
        if(!test.skipped)
            this.success = test.passed;
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