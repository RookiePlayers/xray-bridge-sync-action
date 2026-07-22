import { TestReporter, JestReporter } from './jestParser';
import { MochaReporter } from './mochaParser';
import { JUnitXmlReporter } from './junitXmlParser';

export { TestReporter };

/**
 * Returns the correct reporter implementation for a given reporter name.
 * Pest and Pytest share the JUnit XML parser since both natively output
 * JUnit XML format (--log-junit and --junit-xml respectively).
 */
export function getReporter(reporter: string): TestReporter {
  switch (reporter) {
    case 'jest':
      return new JestReporter();
    case 'mocha':
      return new MochaReporter();
    case 'pest':
    case 'pytest':
      return new JUnitXmlReporter();
    default:
      throw new Error(
        `Unsupported reporter: ${reporter}. Supported: jest, mocha, pest, pytest`
      );
  }
}
