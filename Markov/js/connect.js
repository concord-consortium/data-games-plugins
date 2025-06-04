let connect;

/**
 * Singleton responsible for communicating with CODAP
 *
 * @type {{deleteDatasetOnCODAP: ((function(*): Promise<void>)|*), getSuitableDatasetName: (function(*): Promise<*>), allowReorg: ((function(): Promise<void>)|*), datasetExistsOnCODAP: (function(*): Promise<boolean>), iFrameDescriptor: {name: string, title: string, version: string, dimensions: {width: number, height: number}}, deleteCasesOnCODAPinCODAPDataset: ((function(*): Promise<void>)|*), showTable: connect.showTable, showScrambled: connect.showScrambled, initialize: ((function(): Promise<void>)|*)}}
 */
connect = {

    /**
     * Initialize the connection to CODAP
     *
     * @returns {Promise<void>}
     */
    initialize: async function () {
        await codapInterface.init(this.iFrameDescriptor, null);
    },

    /**
     * Constant descriptor for the iFrame.
     * Find and edit the values in `scrambler.constants`
     */
    iFrameDescriptor: {
        name: "Markov",
        title: "Markov",
        version: "2.1",
        dimensions: { width: 550, height: 340 },
    },

    /**
     * Find a dataset that is not _scrambled or _measures, preferably the one we pass in!
     *
     * If that doesn't exist, pick the first one in the list.
     *
     * @param iName     Default name, typically the one we have been using all along or restored from save
     * @returns {Promise<*>}
     */
    getSuitableDatasetName : async function(iName) {
        let tDSNameList = [];
        const tMessage = {
            action: "get",
            resource: "dataContextList"
        };
        const tListResult = await codapInterface.sendRequest(tMessage);
        if (tListResult.success) {
            tListResult.values.forEach((ds) => {
                const theName = ds.name
                //  measures and scrambled datasets are unsuitable
                if (!(theName.startsWith(stringUtility.tr(scrambler.constants.measuresPrefixStringID)) ||
                    theName.startsWith(stringUtility.tr(scrambler.constants.scrambledPrefixStringID)))) {
                    tDSNameList.push(theName);
                }
            });
        }
        return (tDSNameList.includes(iName)) ? iName : tDSNameList[0];
    },

    /**
     * Does the named dataset already exist in CODAP's list of data contexts?
     * @param iName
     * @returns {Promise<void>}
     */
    datasetExistsOnCODAP: async function (iName) {
        let out = false;

        const existMessage = {
            action: "get",
            resource: `dataContextList`,
        }
        const tListResult = await codapInterface.sendRequest(existMessage);
        if (tListResult.success) {
            tListResult.values.forEach((ds) => {
                if (ds.name === iName) {
                    out = true;
                }
            })
        }
        return out;
    },

    /**
     * Ask CODAP to delete the named dataset
     * @param iName     the name
     * @returns {Promise<void>}
     */
    deleteDatasetOnCODAP : async function(iName) {
        if (iName) {
            const tDeleteMessage = {
                action: "delete",
                resource: `dataContext[${iName}]`,
            }
            const dResult = await codapInterface.sendRequest(tDeleteMessage);
            console.log(`    deleting [${iName}]: (${dResult.success ? "success" : "failure"})`);
        } else {
            console.log(`    no dataset name passed in to delete!`);
        }
    },

    /**
     * Empty a dataset so it has a structure, but no cases.
     *
     * @param iDS
     * @returns {Promise<void>}
     */
    deleteCasesOnCODAPinCODAPDataset : async function(iDS) {
        const tCollName = iDS.structure.collections[0].name;
        const tResource = `dataContext[${iDS.datasetName}].collection[${tCollName}].allCases`;
        const dResult = await codapInterface.sendRequest({
            action : "delete",
            resource : tResource,
        })
        console.log(`    flushing [${iDS.datasetName}]: (${dResult.success ? "success" : "failure"})`);

    },

    /**
     * Kludge to ensure that a dataset is reorg-able.
     *
     * @returns {Promise<void>}
     */
    allowReorg: async function () {
        const tMutabilityMessage = {
            "action": "update",
            "resource": "interactiveFrame",
            "values": {
                "preventBringToFront": false,
                "preventDataContextReorg": false
            }
        };

        codapInterface.sendRequest(tMutabilityMessage);
    },

    /**
     * Show the table for the named dataset
     * @param iName     dataset name
     */
    showTable: function (iName) {
        codapInterface.sendRequest({
            "action": "create",
            "resource": "component",
            "values": {
                "type": "caseTable",
                "dataContext": iName,
            }
        });
    },

}
