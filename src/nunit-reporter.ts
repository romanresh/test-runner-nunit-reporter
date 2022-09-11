import { GetTestProgressArgs, Reporter, ReportTestResultsArgs, SessionResult, TestResult, TestRunFinishedArgs, TestRunStartedArgs, TestSession } from "@web/test-runner-core";
import { ReporterArgs, StopArgs } from "@web/test-runner-core/dist/reporter/Reporter";
import path from 'path';
import fs from 'fs';
import os from 'os';
import { XmlObject } from 'xml';
import { create } from 'xmlbuilder2';
import { XMLBuilder } from "xmlbuilder2/lib/interfaces";

export interface NUnitReporterArgs {
    outputPath?: string;
    reportLogs?: boolean;
    /* package root dir. defaults to cwd */
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
        const xml = this.generator.getXml(args.sessions);
        fs.writeFileSync(this.outputPath, xml);
    }

    private generateXml(sessions: TestSession[]): string {
        for(let session of sessions) {

        }
    }

    private getTestCase(test: TestResult): XmlObject {
        
    }
}

class NUnit2TestResultGenerator {
    protected testsCount: number = 0;
    protected testsErrors: number = 0;
    protected testsFailures: number = 0;
    protected testsInconclusive: number = 0;
    protected testsNotRun: number = 0;
    protected testsIgnored: number = 0;
    protected testsSkipped: number = 0;
    protected testsInvalid: number = 0;
    protected lastDate: Date;
    generate(sessions: TestSession[]): XMLBuilder {
        const root = create({ version: '1.0', encoding: 'utf-8', standalone: 'no' });
        const testResults = root.ele('test-results')
        const d = this.lastDate;
        testResults.ele('environment', {
            "nunit-version": "2.5.8.0",
            "clr-version": "2.0.50727.1433",
            "os-version": os.release(),
            "platform": os.platform(),
            "cwd": process.cwd,
            "machine-name": os.hostname(),
            "user": os.userInfo().username,
            "user-domain": os.userInfo().shell
        });
        testResults.ele('culture-info', {
            "current-culture": "en-US",
            "current-uiculture": "en-US"
        });
        testResults.ele('culture-info', {
            "current-culture": "en-US",
            "current-uiculture": "en-US"
        });
        const results = testResults.ele('results');
        for(let session of sessions) {
            this.processSession(results, session);
        }
        testResults.att({
            name: "",
            total: this.testsCount,
            errors: this.testsErrors,
            failures: this.testsFailures,
            inconclusive: this.testsInconclusive,
            "not-run": this.testsNotRun,
            ignored: this.testsIgnored,
            skipped: this.testsSkipped,
            invalid: this.testsInvalid,
            date: `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`,
            time: `${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`
        });
        return testResults;
    }
    processSession(parent: XMLBuilder, session: TestSession) {
        
    }
    getResults(name: string, total: number, errors: number, failures: number, inconclusive: number, notRun: number,
        ignored: number, skipped: number, invalid: number, date: Date): XmlObject {
        return {
            _attr: {
                name,
                total,
                errors,
                failures,
                inconclusive,
                "not-run": notRun,
                ignored,
                skipped,
                invalid,
                date: date.getDate(),
                time: date.getTime()
            }
        }
    }
}

interface NUnit2Results {
    'test-results': NUnit2TestResultsTag
}

type NUnit2TestResultsTag = [
    {
        _attr: {
            name: string,
            total: number,
            errors: number,
            failures: number,
            inconclusive: number,
            "not-run": number,
            ignored: number,
            skipped: number,
            invalid: number,
            date: string,
            time: string
        }
    }, {
        "environment": NUnit2EnvironmentTag,
        "culture-info": NUnit2CultureInfoTag,
        "test-suite": NUnit2TestSuiteTag
    }
]

type NUnit2EnvironmentTag = [
    {
        _attr: {
            "nunit-version": string,
            "clr-version": string,
            "os-version": string,
            "platform": string,
            "cwd": string,
            "machine-name": string,
            "user": string,
            "user-domain": string
        }
    }
];
type NUnit2CultureInfoTag = [
    {
        _attr: {
            "current-culture": string,
            "current-uiculture": string
        }
    }
];
type NUnit2TestSuiteTag = [
    {
        _attr: {
            type: string,
            name: string,
            description?: string,
            success?: string,
            time?: string,
            executed: string,
            asserts?: string,
            result: string
        }
    },
    {
        categories: [
            { 
                "category": {
                    _attr: {
                        name: string
                    }
                }
            }
        ],
        properties: [
            {
                "property": {
                    _attr: {
                        name: string,
                        value: string
                    }
                }
            }
        ],
        failure: NUnit2FailureTag,
        reason: NUnit2ReasonTag,
        results: NUnit2ResultsTag
    }
];
type NUnit2TestCaseTag = [
    {
        _attr: {
            type: string,
            name: string,
            description?: string,
            success?: string,
            time?: string,
            executed: string,
            asserts?: string,
            result: string
        }
    },
    {
        categories: [
            { 
                "category": {
                    _attr: {
                        name: string
                    }
                }
            }
        ],
        properties: [
            {
                "property": {
                    _attr: {
                        name: string,
                        value: string
                    }
                }
            }
        ],
        failure: NUnit2FailureTag,
        reason: NUnit2ReasonTag
    }
];
type NUnit2FailureTag = {
    "message": {
        _cdata: string
    },
    "stack-trace": {
        _cdata: string
    }
}
type NUnit2ReasonTag = {
    "message": {
        _cdata: string
    }
}
type NUnit2ResultsTag = {
    "test-suite": NUnit2TestSuiteTag,
    "test-case": NUnit2TestCaseTag
}

export function nunitReporter(config: NUnitReporterArgs): Reporter {
    return new NUnitReporter(config);
}