
var self = this;
var base64 = {};
var generateBitmap = {};

onmessage = function(e){

	try{

		//grab our function data
		var funData = e.data;

        //grab the wid
        var wid = funData.wid;

		var nodeOrder = funData.nodeOrder;
		var biasCount = funData.biasCount;
		var outputCount = funData.outputCount;
		var stFun = funData.stringFunctions;

		if(!nodeOrder || !biasCount || !outputCount || !stFun)
			throw new Error("Improper worker message sent. Need Node Order, Bias and OutputCounts, and String Functions for network");

        var nodeFunctions = {};
		//now we can create a contained function
		for(var id in stFun)
		{
			//replace string with function object
			nodeFunctions[id] = new Function([], stFun[id]);
		}


		//now we create a function that takes inputs, and runs the CPPN. BIATCH
		var cppnFunction = containCPPN(nodeOrder, nodeFunctions, biasCount, outputCount);


		//need with and height, thank you! non-zero ddoy
		if(!wid || !funData.width || !funData.height)
			throw new Error("No wid, width, or height provided for fixed size CPPN Activation");

		//okay, now we have our CPPN all pampered and ready to go
        // var cppnOutputs = runCPPNAcrossFixedSize(cppnFunction, {width: funData.width, height: funData.height});
		var cppnOutputs = runCPPNAcrossFixedSize(cppnFunction, funData.gridSize, funData.useLEO, funData.weightRange);
        // activationFunction, size, useLeo, weightRange, testing

		//cppn outputs to RGB Bitmap -- huzzah!
		// var fileOutput = generateBitmap.generateBitmapDataURL(cppnOutputs);

		//send back our data, we'll have to loop through it and convert to bytes, but this is the raw data
		postMessage({wid: wid, body: cppnOutputs, size: funData.gridSize});
	}
	catch(e)
	{
		 // Send back the error to the parent page
  		postMessage({error: e.message, stack: e.stack});
	}
};


function BodyConnection(gid, weight, srctgtObj)
{

    var self = this;
    self.gid = gid;
    self.weight = weight;
    self.sourceID = srctgtObj.sourceID;
    self.targetID = srctgtObj.targetID;

    return self;
};

function containCPPN(nodesInOrder, functionsForNodes, biasCount, outputCount)
{
    return function(inputs)
    {
        var bias = 1.0;
        var context = {};
        context.rf = new Array(nodesInOrder.length);
        var totalIn = inputs.length + biasCount;

        for(var i=0; i < biasCount; i++)
            context.rf[i] = bias;

        for(var i=0; i < inputs.length; i++)
            context.rf[i+biasCount] = inputs[i];


        for(var i=0; i < nodesInOrder.length; i++)
        {
            var fIx = nodesInOrder[i];
//                console.log('Ix to hit: ' fIx + );
            context.rf[fIx] = (fIx < totalIn ? context.rf[fIx] : functionsForNodes[fIx].call(context));
        }

        return context.rf.slice(totalIn, totalIn + outputCount);
    }
};

function ConstructGridObject(resolution)
{
    var dx = 2 / (resolution-1);
    var dy = 2 / (resolution -1);
    var fX = -1, fY = -1;

    //var threeNodeDistance = Math.sqrt(9.0 * dx * dx + 9.0 * dy * dy);
    var xDistanceThree = 3 * dx;
    var yDistanceThree = 3 * dy;

    var queryPoints = [];

    for (var x = 0; x < resolution; x++)
    {
        for (var y = 0; y < resolution; y++)
        {
            queryPoints.push({x: fX, y: fY});
            //now increment fy and go again
            fY += dy;
        }
        //increment dx, run through again
        //reset fy to -1
        fX += dx;
        fY = -1;
    }

    return {grid: queryPoints, threeX: xDistanceThree, threeY: yDistanceThree};

};

function runCPPNAcrossFixedSize(activationFunction, size, useLeo, weightRange, testing)
{

    //has our grdi to query, and max distance things
    //build grid of points, and define 3*dx and 3*dy for the resolution
    var grid = ConstructGridObject(size);

    //we'll check for emptyness
    var isEmpty = false;

    //we want the genome, so we can acknowledge the genomeID!

    //now convert a network to a set of hidden neurons and connections

    //we'll make body specific function calls later

    var inputs =[], outputs = [], hiddenNeurons = {};

    //zero out our count object :)
    hiddenNeurons.count = 0;

    var connections = [];

    //loop through a grid, defined by some resolution, and test every connection against another using leo


    var queryPoints = grid.grid;
    var xDistanceThree = grid.threeX;
    var yDistanceThree = grid.threeY;

//        console.log(queryPoints);
    var counter = 0;
    var conSourcePoints = {};//new Dictionary<long, PointF>();
    var conTargetPoints = {};//new Dictionary<long, PointF>();

    var accessDoubleArray = function(obj, xyPoint)
    {
        return obj[xyPoint.x][xyPoint.y];
    };
    var ensureDoubleArray = function(obj, x, y)
    {
        //don't use !obj[x] since 0 gets grouped into that. poop.
        if (obj[x] === undefined){
            obj[x] = {};
        }

        if(obj[x][y] === undefined){
            obj[x][y] = obj.count;
            obj.count++;
//                console.log('x: ' + x + ' y: ' + y + ' obj: ' + obj[x][y]);
        }
    };

    //Dictionary<string, List<PointF>> pointsChecked = new Dictionary<string, List<PointF>>();
    //List<PointF> pList;
    var src, tgt;
    var cnt =0;
    var allBodyOutputs = [];
    var allBodyInputs = [];

    var attemptToConnectionMap = {};

    //for each points we have
    for(var p1=0; p1 < queryPoints.length; p1++)
    {
        var xyPoint = queryPoints[p1];

        //query against all other points (possibly limiting certain connection lengths
        for(var p2 = p1; p2 < queryPoints.length; p2++)
        {
            var otherPoint = queryPoints[p2];

            if (p1 != p2 && (Math.abs(xyPoint.x - otherPoint.x) < xDistanceThree && Math.abs(xyPoint.y - otherPoint.y) < yDistanceThree))
            {
                var ins = [xyPoint.x, xyPoint.y, otherPoint.x, otherPoint.y];
                var outs = activationFunction(ins);
                // cppnToBody.queryCPPNOutputs(cppn, );//, maxXDistanceCenter(xyPoint, otherPoint),  minYDistanceGround(xyPoint, otherPoint));
                var weight = outs[0];

                if(testing){
                    allBodyInputs.push({p1: xyPoint, p2: otherPoint});
                    allBodyOutputs.push(outs);

                }
                if (useLeo)
                {
                    if (outs[1] > 0)
                    {
//                            console.log(outs);
//                            console.log('XYPoint: ');console.log( xyPoint);
//                            console.log('otherPoint: ');console.log( otherPoint);
                        //add to hidden neurons

                        ensureDoubleArray(hiddenNeurons, xyPoint.x, xyPoint.y);
                        src = accessDoubleArray(hiddenNeurons, xyPoint);

                        ensureDoubleArray(hiddenNeurons, otherPoint.x, otherPoint.y);
                        tgt =  accessDoubleArray(hiddenNeurons, otherPoint);

                        conSourcePoints[counter] = xyPoint;
                        conTargetPoints[counter] = otherPoint;

                        var connection = new BodyConnection(counter++, weight*weightRange, {sourceID:src, targetID:tgt});
                        connection.coordinates = [xyPoint.x, xyPoint.y, otherPoint.x, otherPoint.y];
                        connection.cppnOutputs = outs;

                        connections.push(connection);

                        if(testing)
                            attemptToConnectionMap[allBodyInputs.length] = counter-1;

                    }
                }
                else
                {
                    //add to hidden neurons
                    ensureDoubleArray(hiddenNeurons, xyPoint.x, xyPoint.y);
                    src = accessDoubleArray(hiddenNeurons, xyPoint);

                    ensureDoubleArray(hiddenNeurons, otherPoint.x, otherPoint.y);
                    tgt =  accessDoubleArray(hiddenNeurons, otherPoint);

                    conSourcePoints[counter] = xyPoint;
                    conTargetPoints[counter] = otherPoint;

                    var connection = new BodyConnection(counter++, weight*weightRange, {sourceID:src, targetID:tgt});
                    connection.coordinates = [xyPoint.x, xyPoint.y, otherPoint.x, otherPoint.y];
                    connection.cppnOutputs = outs;

                    connections.push(connection);

                    if(testing)
                        attemptToConnectionMap[allBodyInputs.length] = counter-1;//connections.length;
                }

            }
        }
    }

//        console.log('Counter: ' + counter);

    var connBefore = connections.length;
    var neuronBefore = hiddenNeurons.count;

//        PreHiddenLocations
//        var preNeurons = {count: 0};

//        if(testing){
//            var inverted = {};
//
//            for(var key in hiddenNeurons)
//            {
//                if(key != 'count')
//                {
//                    for(var innerKey in hiddenNeurons[key])
//                    {
//                        inverted[(hiddenNeurons[key][innerKey])] = {x: key, y: innerKey};
//                    }
//                }
//            }
//            console.log(inverted);
//
//            for(var ix =0; ix < hiddenNeurons.count; ix++)
//            {
//                console.log('ix: ' + ix + ' inv: ' + inverted[ix]);
//                var point = inverted[ix];
//                ensureDoubleArray(preNeurons, point.x, point.y);
//            }
//        }

    var rep = ensureSingleConnectedStructure(connections, hiddenNeurons, conSourcePoints, conTargetPoints);

    connections = rep.connections;
    hiddenNeurons = rep.hiddenNeurons;

//        console.log('Looking at body with: ' + hiddenNeurons.count + ' conns: ' + connections.length);
    if (hiddenNeurons.count > 20 || connections.length > 100)
    {
        hiddenNeurons = {count:0};//new List<PointF>();
        connections = [];//new ConnectionGeneList();
    }


    if (hiddenNeurons.count == 0 || connections.length == 0)
        isEmpty = true;


    var invertedHidden = {};
    for(var key in hiddenNeurons)
    {
        if(key != 'count')
        {
            for(var innerKey in hiddenNeurons[key])
            {
                invertedHidden[hiddenNeurons[key][innerKey]] = {x: parseFloat(key), y:parseFloat(innerKey)};
            }
        }
    }

    var hiddenFinal = [];
    for(var i=0; i< hiddenNeurons.count; i++)
    {
        hiddenFinal.push(invertedHidden[i]);
    }



    var esBody = {
        connections : connections,
        hiddenLocations : hiddenFinal,//hiddenNeurons,
        inputLocations : inputs,
        useLEO : useLeo,
        isEmpty: isEmpty,
        fromJS: true
    };

    if(testing)
    {
        //an array of point pairs (p1, p2), representing input coordinates
        esBody['allBodyInputs'] = allBodyInputs;
        //an array of all the network outputs
        esBody['allBodyOuputs'] = allBodyOutputs;

        //what index of attempts did we create this connection
        esBody['indexToConnection'] = attemptToConnectionMap;

        //count of neurons and connections before the cutoff function (if over a certain amount, they are cut off)
        esBody['beforeNeuron'] = neuronBefore;
        esBody['beforeConnection'] = connBefore;
    }

    //then convert the body into JSON
//        console.log(" Nodes: " + hiddenNeurons.count + " Connections: " + connections.length);

    return esBody;
};

function oldActivation(activationFunction, size)
{


    var inSqrt2 = Math.sqrt(2);

    var allX = size.width, allY = size.height;
    var width = size.width, height= size.height;

    var startX = -1, startY = -1;
    var dx = 2.0/(allX-1), dy = 2.0/(allY-1);

    var currentX = startX, currentY = startY;

    var newRow;
    var rows = [];

    var inputs = [];
    var outputs, rgb;


    //we go by the rows
    for(var y=allY-1; y >=0; y--){

        //init and push new row
        var newRow = [];
        rows.push(newRow);
        for(var x=0; x < allX; x++){

            //just like in picbreeder!
            var currentX = ((x << 1) - width + 1) / width;
            var currentY = ((y << 1) - height + 1) / height;

            inputs = [currentX, currentY, Math.sqrt(currentX*currentX + currentY*currentY)*inSqrt2];

            //run the CPPN please! Acyclic cppns only, thank you
            outputs = activationFunction(inputs);

            //rgb conversion here
            rgb = FloatToByte(PicHSBtoRGB(outputs[0], clampZeroOne(outputs[1]), Math.abs(outputs[2])));

            //add to list of outputs to return
            newRow.push(rgb);
        }
    }

    return rows;
}

function clampZeroOne(val)
{
    return Math.max(0.0, Math.min(val,1.0));
};
function FloatToByte(arr)
{
    var conv = [];

    arr.forEach(function(col)
    {
        conv.push(Math.floor(col*255.0));
    });

    return conv;
};

function ensureSingleConnectedStructure(connections, hiddenNeurons, conSourcePoints, conTargetPoints)
{
    //a list of lists
    var allChains = [];
    var maxChain = 0;

    for(var i=0; i < connections.length; i++)
    {
        var connection = connections[i];

        var isInChain = false;
        var nChain;
        //track connected structures through all the other chains
        for(var c=0; c< allChains.length; c++)
        {

            //check our chain out, does it have this neuron?
            var chain = allChains[c];

            //what's the largest chain we've seen
            maxChain = Math.max(chain.count, maxChain);

            if (chain[connection.sourceID] || chain[connection.targetID])
            {
                nChain = chain;
                isInChain = true;
                break;
            }
        }

        if (!isInChain)
        {
            //chains are just objects, and we can quickly lookup if we've seen anything before
            //we do lick to keep count though!
            nChain = {count:0};
            allChains.push(nChain);
        }

        if (!nChain[connection.sourceID]){
            nChain[connection.sourceID] = true;
            nChain.count++;
        }
        if (!nChain[connection.targetID]){
            nChain[connection.targetID] = true;
            nChain.count++;
        }
    }


    //gotta find the max chain, here is our check
    //allChains.Find(chain => chain.length == maxChain);
    var finalChain;
    for(var c =0; c < allChains.length; c++)
    {
        if(allChains[c].count == maxChain)
        {
            finalChain = allChains[c];
            break;
        }
    }

    var inverseHidden = {};
    //we might adjust hidden neuron count later, make sure we keep original value
    var originalHiddenCount = hiddenNeurons.count;
    for(var key in hiddenNeurons)
    {
        if(key != 'count')
        {
            for(var innerKey in hiddenNeurons[key])
            {
                inverseHidden[hiddenNeurons[key][innerKey]] = {x:key, y:innerKey};
            }
        }
    }



    if (finalChain && finalChain.count != 0)
    {
        var markDelete = [];
        var point;
        for(var c =0; c < connections.length; c++)
        {
            var connection = connections[c];

            var del = false;
            //if we don't have you in our chain, get rid of the object
            if (!finalChain[connection.sourceID])
            {
                point = conSourcePoints[connection.gid];

                //remove hidden node, friend!
                if(hiddenNeurons[point.x][point.y] !== undefined){
                    delete hiddenNeurons[point.x][point.y];
                    hiddenNeurons.count--;
                }

                //hiddenNeurons.Remove(conSourcePoints[conn.InnovationId]);
                del = true;

            }

            if (!finalChain[connection.targetID])
            {
                point = conTargetPoints[connection.gid];

                //remove hidden node, friend!
                if(hiddenNeurons[point.x][point.y] !== undefined){
                    delete hiddenNeurons[point.x][point.y];
                    hiddenNeurons.count--;
                }

                //hiddenNeurons.Remove(conTargetPoints[conn.InnovationId]);

                del = true;
            }

            if (del){
                markDelete[connection.gid] = true;
            }
        }

        //let's rebuild connections, and remove any deleted objects
        var des = connections.length;
        var repConns = [];
        for(var c=0; c< connections.length; c++)
        {
            if(!markDelete[connections[c].gid])
                repConns.push(connections[c]);
        }
        connections = repConns;
//            console.log('actual Size: ' + des + ' Desired: ' + repConns.length);
//            console.log('Connections: ');
//            console.log(repConns);

//                markDelete.ForEach(x => connections.Remove(x));
    }

    //now that we've deleted the hidden neuron objects, lets recalculate the current indices
    var nCount = 0, p;

    //we access the inverse object in order, and map to our hidden node array with deleted object
    for(var hid = 0; hid < originalHiddenCount; hid++)
    {
        if(inverseHidden[hid]){
            p = inverseHidden[hid];
            if(hiddenNeurons[p.x][p.y] != undefined)
                hiddenNeurons[p.x][p.y] = nCount++;
        }
    }


    for(var c=0; c< connections.length; c++)
    {
        var connection = connections[c];

        //readjust connection source/target depending on hiddenNeuron array
        var point = conSourcePoints[connection.gid];
        connection.sourceID = hiddenNeurons[point.x][point.y];

        //now adjust the target!
        point = conTargetPoints[connection.gid];
        connection.targetID = hiddenNeurons[point.x][point.y];
    }

    return {connections: connections, hiddenNeurons: hiddenNeurons};
};

