import * as builder from 'botbuilder';
import { conversations, ConversationState, TranscriptLine } from './globals';
import { Express } from 'express';

const addToTranscript = (transcript: TranscriptLine[], message: builder.IMessage) => {
    console.log("transcribing message", message);
    transcript.push({
        timestamp: message.timestamp,
        from: message.address,
        text: message.text
    });
}

export const route = (
    event: builder.IEvent,
    bot: builder.UniversalBot,
    next: Function
) => {
    console.log("middleware event", event);
    console.log("conversations", conversations);

    switch (event.type) {
        case 'message':
            const message = event as builder.IMessage;
            if (message.user.name.startsWith("Agent")) {
                console.log("message from agent");

                let conversation = conversations.find(conversation =>
                    conversation.agent && conversation.agent.conversation.id === message.address.conversation.id
                );
                console.log('conversation for agent: ', conversation);

                if (!conversation) {
                    if (message.text === 'connect') {
                        // agent api for dealing with queue of users who initiated talk to agent state
                        // replace with button that handles functionality
                        let waitingCustomers = conversations.filter((x) => x.state === ConversationState.Waiting);
                        console.log('customers in Waiting state: ', waitingCustomers);

                        if (waitingCustomers.length === 0) {
                            bot.send(new builder.Message().address(message.address).text("You are no longer in conversation with the user. No users waiting"));
                            return;
                        } else {
                            waitingCustomers.sort((x: any, y: any) =>  y.transcript[y.transcript.length - 1].timestamp - x.transcript[x.transcript.length - 1].timestamp)
                            // connect this agent to the customer that has been waiting the longest                        
                            waitingCustomers[0].agent = message.address;
                            waitingCustomers[0].state = ConversationState.Agent;
                            return;
                        }
                    } else {
                        bot.send(new builder.Message().address(message.address).text("You are no longer in conversation and did not try connecting to a customer"));
                        return;
                    }
                }

                if (conversation.state !== ConversationState.Agent) {
                    bot.send(new builder.Message().address(message.address).text("Shouldn't be in this state - agent should have been cleared out."));
                    console.log("Shouldn't be in this state - agent should have been cleared out");
                    return;
                } else if (conversation.state === ConversationState.Agent && message.text === 'disconnect') {
                    console.log('disconnecting from user');
                    conversation.state = ConversationState.Bot;
                    delete conversation.agent;
                    bot.send(new builder.Message().address(message.address).text("Disconnected from user. This conversation id should go away now"));
                    return;
                    

                }

                console.log("passing agent message to user");
                addToTranscript(conversation.transcript, message);
                bot.send(new builder.Message().address(conversation.customer).text(message.text));
                return;
            } else {
                console.log("message from customer");
                let conversation = conversations.find(conversation =>
                    conversation.customer.conversation.id === message.address.conversation.id
                );

                if (!conversation) {
                    // first time caller, long time listener
                    conversation = {
                        customer: message.address,
                        state: ConversationState.Bot,
                        transcript: []
                    };
                    conversations.push(conversation);
                }
                addToTranscript(conversation.transcript, message);

                switch (conversation.state) {
                    case ConversationState.Bot:
                        if (message.text === 'help') {
                            console.log("switching to Waiting");
                            conversation.state = ConversationState.Waiting;
                            bot.send(new builder.Message().address(message.address).text("Connecting you to the next available agent."));

                            return;
                        }
                        console.log("pasing message to bot");
                        return next();
                    case ConversationState.Waiting:
                        console.log("ignore message while waiting");
                        bot.send(new builder.Message().address(message.address).text("Connecting you to the next available agent."));
                        return;
                    case ConversationState.Agent:
                        if (!conversation.agent) {
                            bot.send(new builder.Message().address(message.address).text("No agent address present while customer in state Agent"));
                            console.log("No agent address present while customer in state Agent");
                            return;
                        }
                        console.log("passing message to agent");
                        bot.send(new builder.Message().address(conversation.agent).text(message.text));
                        return;
                }

            }
    }
}

export const addHandoffHooks = (app: Express) => {
    app.get('/handoff/conversations', (req, res) => {
        res.send(JSON.stringify(conversations));
    });
}
