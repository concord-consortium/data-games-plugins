"use strict";
let notificatons = {

    documentSubscriberIndex: null,
    datasetSubscriberIndex: null,
    attributeDropSubscriberIndex: null,

    /**
     * Register for doc change events.
     *
     * Why? If the user deletes the source dataset, we need to know.
     */
    registerForDocumentChanges : function() {
        const tResource = `component`;
        this.documentSubscriberIndex = codapInterface.on(
            'notify',
            tResource,
            notificatons.handleDocumentChangeNotice
        );
    },

    /**
     * We have detected that the document has changed.
     * If the change is creation of a graph, we want to place attributes on x and y
     *
     * @param iMessage
     */
    handleDocumentChangeNotice : async function (iMessage) {
        var tValues = iMessage.values;
        if (tValues.operation === 'create' && tValues.type === 'graph') {
            var graphID = tValues.id;
            // Without the setTimeout the graph gets confused about extents
            setTimeout(async () => {
                await codapInterface.sendRequest({
                    action: "update",
                    resource: `component[${graphID}]`,
                    values: {
                        xAttributeName: 'previous_2_markov_moves',
                        yAttributeName: 'markovs_move'
                    }
                });
            });
        }
    },


};
