import { ImageSourcePropType } from 'react-native';

export interface Server {
  id: string;
  name: string;
  icon: ImageSourcePropType;
  unread: boolean;
}

export interface Channel {
  id: string;
  name: string;
  unread: boolean;
}

export type BaseMessage = {
  id: string;
  user: string;
  avatar: ImageSourcePropType;
  time: string;
  content: string;
  hasLink?: false;
};

export type MessageWithLink = Omit<BaseMessage, 'hasLink'> & {
  hasLink: true;
  link: string;
  linkText: string;
};

export type Message = BaseMessage | MessageWithLink;

export interface User {
  id: string;
  name: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  avatar: string;
}

export const servers: Server[] = [
  { id: '1', name: 'Quilibrium Node Runners', icon: require('../assets/images/qlogo.png'), unread: true },
  { id: '2', name: 'Design Community', icon: require('../assets/images/quorum-symbol-bg-blue.png'), unread: false },
];

export const channels: Channel[] = [
  { id: '1', name: 'general', unread: true },
  { id: '2', name: 'bug-reports', unread: false },
  { id: '3', name: 'suggestions', unread: false },
];

export const messages: Message[] = [
  { id: '1', user: 'Cassie', avatar: require('../assets/images/icon.png'), time: '7:01 PM', content: 'Session zero this Friday is still on, right?', hasLink: false },
  { id: '2', user: 'Jay', avatar: {uri: 'https://i.pravatar.cc/256?u=jay-dnd-bard'}, time: '7:02 PM', content: 'Yes, I am ready to finally play this chaos bard.', hasLink: false },
  { id: '3', user: 'Priya', avatar: {uri: 'https://i.pravatar.cc/256?u=morgan-dnd-artificer1'}, time: '7:02 PM', content: 'I finished my character backstory at lunch and it is extremely dramatic.', hasLink: false },
  { id: '4', user: 'Leo', avatar: {uri: 'https://i.pravatar.cc/256?u=leo-dnd-wizard---'}, time: '7:04 PM', content: 'Good, the party needs at least one dramatic disaster per session.', hasLink: false },
  { id: '5', user: 'Morgan', avatar: {uri: 'https://i.pravatar.cc/256?u=priya-dnd-paladin'}, time: '7:04 PM', content: 'I am still tweaking my artificer. Does the group need more healing or more explosives?', hasLink: false },
  { id: '6', user: 'Cassie', avatar: require('../assets/images/icon.png'), time: '7:04 PM', content: 'As Dungeon Master I will say yes. Yes to both.', hasLink: false },
  { id: '7', user: 'Jay', avatar: {uri: 'https://i.pravatar.cc/256?u=jay-dnd-bard'}, time: '7:04 PM', content: 'I support more explosives. My bard can heal with the power of interpretive dance.', hasLink: false },
  { id: '8', user: 'Priya', avatar: {uri: 'https://i.pravatar.cc/256?u=morgan-dnd-artificer1'}, time: '7:04 PM', content: 'My paladin has plenty of healing, as long as the gods approve of our life choices.', hasLink: false },
  { id: '9', user: 'Leo', avatar: {uri: 'https://i.pravatar.cc/256?u=leo-dnd-wizard---'}, time: '7:09 PM', content: 'So the party is fine as long as Jay behaves. We are doomed.', hasLink: false },
  { id: '10', user: 'Morgan', avatar: {uri: 'https://i.pravatar.cc/256?u=priya-dnd-paladin'}, time: '7:09 PM', content: 'I will bring snacks to increase survival odds.', hasLink: false },
  { id: '11', user: 'Cassie', avatar: require('../assets/images/icon.png'), time: '7:09 PM', content: 'Reminder: level 3 start, standard array, no evil alignments, and session starts at 7 sharp.', hasLink: false },
  { id: '12', user: 'Jay', avatar: {uri: 'https://i.pravatar.cc/256?u=jay-dnd-bard'}, time: '7:13 PM', content: 'Question: can my bard have a pet goose that hisses at authority figures?', hasLink: false },
  { id: '13', user: 'Cassie', avatar: require('../assets/images/icon.png'), time: '7:14 PM', content: 'If you spend starting gold on it and name it something majestic, yes.', hasLink: false },
  { id: '14', user: 'Jay', avatar: {uri: 'https://i.pravatar.cc/256?u=jay-dnd-bard'}, time: '7:15 PM', content: 'Perfect. The goose is named Sir Honksalot, third of his name.', hasLink: false },
  { id: '15', user: 'Priya', avatar: {uri: 'https://i.pravatar.cc/256?u=morgan-dnd-artificer1'}, time: '7:16 PM', content: 'My paladin is absolutely swearing an oath to protect Sir Honksalot.', hasLink: false },
];

export const users: User[] = [
  { id: '1', name: 'Alex Johnson', status: 'online', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=900&auto=format&fit=crop&q=60' },
  { id: '2', name: 'Sarah Miller', status: 'idle', avatar: 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=900&auto=format&fit=crop&q=60' },
  { id: '3', name: 'Mike Chen', status: 'dnd', avatar: 'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=900&auto=format&fit=crop&q=60' },
  { id: '4', name: 'Emma Wilson', status: 'online', avatar: 'https://images.unsplash.com/photo-1605993439219-9d09d2020fa5?w=900&auto=format&fit=crop&q=60' },
  { id: '5', name: 'David Kim', status: 'offline', avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=900&auto=format&fit=crop&q=60' },
];

