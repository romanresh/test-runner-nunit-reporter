import { GetTestProgressArgs, Reporter, ReportTestResultsArgs, TestResult, TestRunFinishedArgs, TestRunStartedArgs, TestSession } from "@web/test-runner-core";
import { ReporterArgs, StopArgs } from "@web/test-runner-core/dist/reporter/Reporter";
import path from 'path';
import fs from 'fs';
import { XmlObject } from 'xml';

export interface NUnitReporterArgs {
    outputPath?: string;
    reportLogs?: boolean;
    /* package root dir. defaults to cwd */
    rootDir?: string;
}

class NUnitReporter implements Reporter {
    protected outputPath: string;
    protected rootDir: string;
    constructor(config: NUnitReporterArgs) { 
        const outputPath = config.outputPath || "./test-report.xml";
        this.rootDir = process.cwd();
        this.outputPath = path.resolve(this.rootDir, outputPath);
    }

    onTestRunFinished(args: TestRunFinishedArgs): void {
        const dir = path.dirname(this.outputPath);
        fs.mkdirSync( dir, { recursive: true });
        const xml = this.generateXml(args.sessions);
        fs.writeFileSync(this.outputPath, xml);
    }

    private generateXml(sessions: TestSession[]): string {
        
    }

    private getTestCase(test: TestResult): XmlObject {
        
    }
}

class NUnit2Reporter {
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
            "nunit-versio": string,
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

let a: Foo = {};
let b: XmlObject = a;

export function nunitReporter(config: NUnitReporterArgs): Reporter {
    return new NUnitReporter(config);
}