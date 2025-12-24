import type { Expression, ImportDefaultSpecifier, ImportSpecifier, Program } from 'acorn';
import Sval from 'sval';

export function createImportDeclarationProgram({
  defaultImport,
  namedImports = [],
  module,
}: {
  defaultImport?: string;
  namedImports?: string[];
  module: string;
}): Program {
  if (!defaultImport && namedImports.length === 0) {
    throw new TypeError("Specify either 'defaultImport' or 'namedImports' with minimum one element or both");
  }

  const defaultLen = defaultImport ? defaultImport.length : 0;
  const namedLen = namedImports.length > 0 ? namedImports.join(', ').length + 4 : 0;
  const moduleLen = module.length;
  const importLen = 7;
  const specifiersLen = defaultLen + namedLen + (defaultLen > 0 && namedLen > 0 ? 2 : 0);
  const fromLen = 6;
  const literalLen = moduleLen + 2;
  const programLen = importLen + specifiersLen + fromLen + literalLen;

  const specifiers: (ImportDefaultSpecifier | ImportSpecifier)[] = [];

  if (defaultImport) {
    specifiers.push({
      type: 'ImportDefaultSpecifier',
      start: importLen,
      end: importLen + defaultLen,
      local: {
        type: 'Identifier',
        start: importLen,
        end: importLen + defaultLen,
        name: defaultImport,
      },
    });
  }

  for (const name of namedImports) {
    const previous = specifiers.length > 0 ? specifiers[specifiers.length - 1] : undefined;
    const start = previous ? (previous.type === 'ImportDefaultSpecifier' ? previous.end + 4 : previous.end + 2) : importLen;
    const end = start + name.length;

    specifiers.push({
      type: 'ImportSpecifier',
      start,
      end,
      imported: {
        type: 'Identifier',
        start,
        end,
        name,
      },
      local: {
        type: 'Identifier',
        start,
        end,
        name,
      },
    });
  }

  return {
    type: 'Program',
    start: 0,
    end: programLen,
    body: [
      {
        type: 'ImportDeclaration',
        start: 0,
        end: programLen,
        specifiers,
        source: {
          type: 'Literal',
          start: importLen + specifiersLen + fromLen,
          end: programLen,
          value: module,
          raw: `'${module}'`,
        },
        attributes: [],
      },
    ],
    sourceType: 'module',
  };
}

export function createExportNamedDeclarationProgram(identifier: string, expressionInput: Expression | ((start: number) => Expression)): Program {
  const exportLen = 7;
  const constLen = 6;
  const identifierLen = identifier.length;
  const assignLen = 3;
  const expression = typeof expressionInput === 'function' ? expressionInput(exportLen + constLen + identifierLen + assignLen) : expressionInput;
  const expressionLen = typeof expression.end === 'number' && typeof expression.start === 'number' ? expression.end - expression.start : 0;
  const programLen = exportLen + constLen + identifierLen + assignLen + expressionLen;

  return {
    type: 'Program',
    start: 0,
    end: programLen,
    body: [
      {
        type: 'ExportNamedDeclaration',
        start: 0,
        end: programLen,
        declaration: {
          type: 'VariableDeclaration',
          start: exportLen,
          end: programLen,
          declarations: [
            {
              type: 'VariableDeclarator',
              start: exportLen + constLen,
              end: programLen,
              id: {
                type: 'Identifier',
                start: exportLen + constLen,
                end: exportLen + constLen + identifierLen,
                name: identifier,
              },
              init: expression,
            },
          ],
          kind: 'const',
        },
        specifiers: [],
        attributes: [],
        source: null,
      },
    ],
    sourceType: 'module',
  };
}

export function createMemberAssignmentExpressionProgram(
  identifier: string,
  member: string,
  expressionInput: Expression | ((start: number) => Expression),
): Program {
  const identifierLen = identifier.length;
  const dotLen = 1;
  const memberLen = member.length;
  const assignLen = 3;
  const expression = typeof expressionInput === 'function' ? expressionInput(identifierLen + dotLen + memberLen + assignLen) : expressionInput;
  const expressionLen = typeof expression.end === 'number' && typeof expression.start === 'number' ? expression.end - expression.start : 0;
  const programLen = identifierLen + dotLen + memberLen + assignLen + expressionLen;

  return {
    type: 'Program',
    start: 0,
    end: programLen,
    body: [
      {
        type: 'ExpressionStatement',
        start: 0,
        end: programLen,
        expression: {
          type: 'AssignmentExpression',
          start: 0,
          end: programLen,
          operator: '=',
          left: {
            type: 'MemberExpression',
            start: 0,
            end: identifierLen + dotLen + memberLen,
            object: {
              type: 'Identifier',
              start: 0,
              end: identifierLen,
              name: identifier,
            },
            property: {
              type: 'Identifier',
              start: identifierLen + dotLen,
              end: identifierLen + dotLen + memberLen,
              name: member,
            },
            computed: false,
            optional: false,
          },
          right: expression,
        },
      },
    ],
    sourceType: 'module',
  };
}

export interface CreateEvaluatorOptions {
  dependencies?: Record<string, unknown>;
}

export interface CreateEvaluatorResult {
  interpreter: Sval;
  evaluateExpression: (expression: Expression) => unknown;
  evaluateProgram: (program: Program) => void;
}

export function createEvaluator({ dependencies = {} }: CreateEvaluatorOptions = {}): CreateEvaluatorResult {
  const interpreter = new Sval({
    sandBox: true,
    ecmaVer: 'latest',
    sourceType: 'module',
  });

  interpreter.import(dependencies);

  interpreter.run(
    createExportNamedDeclarationProgram('__evaluated__', (start) => ({
      type: 'ObjectExpression',
      start,
      end: start + 2,
      properties: [],
    })),
  );

  let id = 0;

  return {
    interpreter,
    evaluateExpression(expression) {
      const member = `$${id++}`;
      const program = createMemberAssignmentExpressionProgram('__evaluated__', member, expression);

      this.interpreter.run(program);

      return interpreter.exports.__evaluated__[member] as unknown;
    },
    evaluateProgram(program) {
      interpreter.run(program);
    },
  };
}
