'use strict';

const StylesMap = require('../util/StylesMap');
const Components = require('../util/Components');
const styleSheet = require('../util/stylesheet');

const { StyleSheets } = styleSheet;
const { astHelpers } = styleSheet;

const create = Components.detect((context, components) => {
  const styleSheets = new StyleSheets();
  const styleReferences = new Set();

  function reportUnusedStyles(unusedStyles) {
    Object.keys(unusedStyles).forEach((key) => {
      if ({}.hasOwnProperty.call(unusedStyles, key)) {
        const styles = unusedStyles[key];
        styles.forEach((node) => {
          const message = [
            'Unused style detected: ',
            key,
            '.',
            node.key.name,
          ].join('');

          context.report(node, message);
        });
      }
    });
  }

  function addImportVariable(node) {
    const importSource = node.parent.source.value;

    if (importSource === 'react' || importSource === 'react-native') {
      return;
    }

    const importedName = node.imported ? node.imported.name : 'default';
    const localName = node.local.name;

    const exportMap = StylesMap.get(importSource, context);

    if (exportMap === null) {
      return;
    }

    if (exportMap.errors.length) {
      StylesMap.reportErrors(context, node, exportMap.errors);
    }

    const styles = exportMap.getStylesByImportedName(importedName);

    styleSheets.add(
      localName,
      styles.map((styleNode) => {
        // eslint-disable-next-line no-param-reassign
        styleNode.loc = node.loc;

        return styleNode;
      })
    );
  }

  return {
    ImportDefaultSpecifier: function (node) {
      addImportVariable(node);
    },

    ImportSpecifier: function (node) {
      addImportVariable(node);
    },

    MemberExpression: function (node) {
      const styleRef = astHelpers.getPotentialStyleReferenceFromMemberExpression(node);
      if (styleRef) {
        styleReferences.add(styleRef);
      }
    },

    VariableDeclarator: function (node) {
      // Search from reassigned variables
      const styleNames = []

      // Base
      if (node?.init?.callee?.name) {
        styleNames.push(node?.init?.callee?.name)
      }

      // Inside an object expression
      node?.init?.properties?.forEach(el => {
        if (el.argument?.consequent?.type === 'Identifier') { // Check for inline if statement
          styleNames.push(el.argument?.consequent?.loc?.identifierName)
        } else {
          styleNames.push(el.argument?.type === 'CallExpression' ? el?.argument?.callee?.name : el?.argument?.name)
        }
      })

      Object.keys(styleSheets.styleSheets).forEach(el => {
        if (styleNames.includes(el)) {
          if (styleSheets.styleSheets[node.id.name]) {
            styleSheets.styleSheets[node.id.name].push(...styleSheets.styleSheets[el])
          } else {
            styleSheets.styleSheets[node.id.name] = styleSheets.styleSheets[el]
          }
          delete styleSheets.styleSheets[el]
        }
      })
    },

    CallExpression: function (node) {
      if (astHelpers.isStyleSheetDeclaration(node, context.settings)) {
        const styleSheetName = astHelpers.getStyleSheetName(node);
        const styles = astHelpers.getStyleDeclarations(node);

        styleSheets.add(styleSheetName, styles);
      }
    },

    'Program:exit': function () {
      const list = components.all();
      if (Object.keys(list).length > 0) {
        styleReferences.forEach((reference) => {
          styleSheets.markAsUsed(reference);
        });
        reportUnusedStyles(styleSheets.getUnusedReferences());
      }
    },
  };
});

module.exports = {
  meta: {
    schema: [],
  },
  create,
};
