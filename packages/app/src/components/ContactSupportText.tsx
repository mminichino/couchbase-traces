import { Anchor } from '@mantine/core';

import { IS_OSS } from '@/config';

const GH_LINK = 'https://github.com/mminichino/couchbase-traces/issues';

export const ContactSupportText = () => {
  if (IS_OSS) {
    return (
      <span>
        Please open an issue on{' '}
        <Anchor
          inherit
          href={GH_LINK}
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </Anchor>
        .
      </span>
    );
  }

  return <span>Please contact support.</span>;
};
