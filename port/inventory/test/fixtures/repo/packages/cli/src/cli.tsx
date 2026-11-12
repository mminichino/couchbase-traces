import { Command } from 'commander';

const program = new Command();

program.command('tui').action(() => {});

program
  .command('auth')
  .command('login')
  .action(() => {});

const team = program.command('team');

team.command('list').action(() => {});
