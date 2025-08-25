import pino from 'pino';
const logger = pino({ level: 'info' }, pino.destination('sprint-pilot.log'));
export default logger;
