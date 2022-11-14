import {
    ActivityType,
    Client,
    Colors,
    IntentsBitField,
    InteractionType,
    PresenceUpdateStatus,
} from "discord.js";
import fs from "fs";
import config from "./config.js";
import { is_string, respond } from "./utils.js";

process.on("uncaughtException", (error) => console.error(error));

const client = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMembers,
        IntentsBitField.Flags.GuildMessages,
    ],
    presence: {
        status: PresenceUpdateStatus.Online,
        activities: [{ type: ActivityType.Listening, name: "your inquiries" }],
    },
});

const commands = [];
const command_map = new Map();

for (const name of fs.readdirSync("src/commands")) {
    const { command, execute, autocomplete } = await import(
        `./commands/${name}`
    );

    commands.push(command);
    command_map.set(command.name, { execute, autocomplete });
}

client.once("ready", async () => {
    await client.application.commands.set(commands);

    try {
        client.hq = await client.guilds.fetch(config.guild);
    } catch {
        console.error(
            "\n\n=== [ CRITICAL ] ===\n\nCould not fetch HQ. Maybe the bot isn't in the server? Most features will not work properly.\n\n=== [ -------- ] ===\n"
        );
    }

    console.log("The Akasha System is online.");
});

client.on("interactionCreate", async (interaction) => {
    if (interaction.type == InteractionType.ApplicationCommand) {
        const { execute } = command_map.get(interaction.commandName) ?? {};

        if (execute) {
            try {
                let data = await execute(interaction);

                if (data) {
                    if (is_string(data)) data = { content: data };
                    await respond(interaction, data);
                }
            } catch (error) {
                await respond(interaction, {
                    embeds: [
                        {
                            title: "Error",
                            description:
                                "An error occurred executing this command.",
                            color: Colors.Red,
                        },
                    ],
                    ephemeral: true,
                });

                throw error;
            }
        }
    } else if (
        interaction.type == InteractionType.ApplicationCommandAutocomplete
    ) {
        const { autocomplete } = command_map.get(interaction.commandName) ?? {};

        if (autocomplete) {
            let data = await autocomplete(interaction);
            if (data) {
                if (!Array.isArray(data)) data = [data];
                await interaction.respond(
                    data.map((x) => (is_string(x) ? { name: x, value: x } : x))
                );
            }
        }
    } else if (
        interaction.type == InteractionType.MessageComponent ||
        interaction.type == InteractionType.ModalSubmit
    ) {
        if (interaction.customId.startsWith(":")) {
            let cmd = interaction.customId.substring(1);
            const [id, key, ...args] = cmd.split(/:/);

            if (id && interaction.user.id != id) return;

            let handle;

            ({ default: handle } = await import(`./components/${key}.js`));

            if (handle) {
                try {
                    let data = await handle(interaction, ...args);

                    if (data) {
                        if (is_string(data)) data = { content: data };
                        await respond(interaction, data);
                    }
                } catch (error) {
                    await respond(interaction, {
                        embeds: [
                            {
                                title: "Error",
                                description:
                                    "An error occurred with this interaction.",
                                color: Colors.Red,
                            },
                        ],
                        ephemeral: true,
                    });

                    throw error;
                }
            }
        }
    }
});

client.on("messageCreate", async (message) => {
    if (message.author.id == client.user.id) return;
    if (message.channelId == config.terminal) await message.delete();
});

await client.login(config.discord_token);
