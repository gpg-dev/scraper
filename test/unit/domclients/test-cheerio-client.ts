import { assert } from 'chai';
import CheerioClient from '../../../src/domclient/CheerioClient';

describe('CheerioClient', () => {
  it('root querySelectorAll', () => {
    const client = new CheerioClient(Buffer.from('<body><p class="classA">pA</p><p class="classB">pB</p></body>'));

    const nodes = client.querySelectorAll('p');
    assert.strictEqual(nodes.length, 2);
    assert.strictEqual(nodes[1].getAttribute('innerText'), 'pB');
    assert.strictEqual(nodes[1].getAttribute('class'), 'classB');
  });

  it('nested querySelectorAll', () => {
    const client = new CheerioClient(Buffer.from('<body><p class="classA"><a class="classA" href="linkA">linkA</a></p></body>'));

    const pNodes = client.querySelectorAll('p');
    assert.strictEqual(pNodes.length, 1);

    let linkNodes = pNodes[0].querySelectorAll('a[class="classA"]');
    assert.strictEqual(linkNodes.length, 1);
    assert.strictEqual(linkNodes[0].getAttribute('href'), 'linkA');

    linkNodes = pNodes[0].querySelectorAll('a[class="classB"]');
    assert.strictEqual(linkNodes.length, 0);
  });
});
