var google = require("googleapis");
var RTM = require("satori-sdk-js"); // TODO: Deprecated

// Credentials file
var credentials = require("./credentials.json");

// Google API key
var gkey = credentials.google.key;

// Satori.com publish keys
var roleSecretKey = credentials.satori.secret;
var appkey = credentials.satori.key;

var endpoint = "wss://open-data.api.satori.com";
var role = "youtube";
var channel = "youtube";

var roleSecretProvider = RTM.roleSecretAuthProvider(role, roleSecretKey);

var rtm = new RTM(endpoint, appkey, {
    authProvider: roleSecretProvider,
});

var subscription = rtm.subscribe(channel, RTM.SubscriptionMode.SIMPLE);

var subscribed = false;
subscription.on("enter-subscribed", function() {
    if (!subscribed) {
        subscribed = true;
        setInterval(search, 10000);
    }
});

rtm.start();

var service = google.youtube('v3');

// Publish delay variables
var lastdate = Date.now();
var nextp = lastdate + 10000;
var list = [];
var timeout = null;
var publishing = false;

// Duplicated video control variable
var alreadyids = [];

function search(before) {
    nextp = Date.now() + 10000;
    var ldate = new Date(lastdate).toISOString();
    // Poll the API
    service.search.list({
        part: "id, snippet",
        order: "date",
        publishedAfter: ldate, // Look after the last received video
        maxResults: 50, // Maximum limit is 50
        safeSearch: "none",
        type: "video",
        key: gkey,
        fields: "items/id, items/snippet"
    }, function(error, data) {
        if (!error && data && data.items && data.items.length > 0) {
            var count = 0;
            for (var i = 0, video; video = data.items[i]; i++) {
                // Duplicated video check
                if (alreadyids.indexOf(video.id.videoId) < 0) {
                    count++;
                    alreadyids.push(video.id.videoId);
                    var d = new Date(video.snippet.publishedAt).getTime();
                    if (d > lastdate) {
                        lastdate = d;
                    }
                    // Append video to the publish array
                    list.push(video);
                }
            }
            
            if (count >= 50) {
                // TODO: Received more than 50 videos (Never happens, but just in case).
                //       Make a new request with videos publishedBefore and publishedAfter the received videos, to get the "next page".
            }

            // Received list is not sorted
            list.sort(function(a, b) {
                return new Date(a.snippet.publishedAt).getTime() - new Date(b.snippet.publishedAt).getTime();
            });

            // Start/continue publishing the videos
            setTimeout(publish, Math.random()*1000);

            // Clear old stored ids            
            if (alreadyids.length > 1000) {
                alreadyids.splice(0, 100);
            }
        }
    });
}

// Instead of pushing all the received videos in a block each 10 seconds, stream them along the next 10 seconds until the next call.
// The larger is the list, the faster it will be drained.
function publish() {
    publishing = true;
    var l = list.shift();
    l && rtm.publish(channel, l);
    if (list.length > 0) {

        var f = (nextp - Date.now()) / list.length;
        var nextdelay = Math.random() * f;

        clearTimeout(timeout);
        timeout = setTimeout(function() {
            publish();
        }, nextdelay);
    } else {
        publishing = false;
    }
}