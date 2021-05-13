# Generate optimized code to compute the first 11 coefficients of the DCT-II
# with 32 inputs.
#
# This is based on the fast DCT algorithm outlined here:
# https://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.118.3056&rep=rep1&type=pdf#page=34
#
# We attempt to optimize the code by:
#    - Precomputing coefficients
#    - Multiplying by the inverse instead of dividing
#    - Unrolling loops and inlining recursive function calls
#    - Only computing the intermediate values needed for the first 11
#      coefficients

def generate(p, t):
    yield '"use strict";'
    yield ''
    yield (f'/** Compute the first {t+1} coefficients of the {2**p}-element '
           'DCT-II. */')
    yield f'const fdct{2**p}_{t+1} = function() {{'
    for line in _generate_C(p):
        yield f'    {line}'
    yield ''
    yield f'    const Y = new Float64Array({2**p});'
    yield ''
    yield f'    return function fdct{2**p}_{t+1}(X, Z) {{'
    G = _generate(p, 'X', 'Y', 0, t)
    next(G)
    for line in G:
        yield f'        {line}'
    yield '        Z[0] = Y[0] * D0;'
    for i in range(1, t+1):
        yield f'        Z[{i}] = Y[{i}] * D1;'
    yield '    };'
    yield '}();'

def _generate_C(p):
    yield 'const C0 = Math.cos(Math.PI / 4);'
    i = 1
    for q in range(3, p+2):
        j = 2 ** q
        for k in range(j // 4):
            yield f'const C{i} = 0.5 / Math.cos(Math.PI * {2*k + 1} / {j});'
            i += 1
    yield f'const D0 = 2 ** {-p/2};'
    yield f'const D1 = 2 ** {(1-p)/2};'

def _generate(p, a, b, i, t):
    if p == 1:
        yield {i, i+1}
        yield f'{b}[{i}] = {a}[{i}] + {a}[{i + 1}];'
        if t >= 1:
            yield f'{b}[{i + 1}] = ({a}[{i}] - {a}[{i + 1}]) * C0;'
        return

    N = 2 ** p
    N_2 = N // 2

    s = set()
    l1 = []
    l2 = []

    G = _generate(p-1, b, a, i, t // 2)
    sG = next(G)
    for k in range(N_2):
        if (i + k) in sG:
            l1.append(f'{b}[{i + k}] = {a}[{i + k}] + {a}[{i + N - 1 - k}];')
            s.add(i+k)
            s.add(i+N-1-k)
    l2.extend(G)

    if t >= 1:
        H = _generate(p-1, b, a, i + N_2, min((t+1)//2, N_2 - 1))
        sH = next(H)
        for k in range(N_2):
            if (i + N_2 + k) in sH:
                l1.append(f'{b}[{i + N_2 + k}] = ({a}[{i + k}] '
                         f'- {a}[{i + N - 1 - k}]) * C{N_2 - 1 + k};')
                s.add(i+k)
                s.add(i + N - 1 - k)
        l2.extend(H)

    yield s
    yield from l1
    yield from l2

    for j in range(N_2 - 1):
        if t < 2*j:
            break
        yield f'{b}[{i + 2*j}] = {a}[{i + j}];'
        if t < 2*j + 1:
            break
        yield (f'{b}[{i + 2*j + 1}] = {a}[{i + N_2 + j}] '
               f'+ {a}[{i + N_2 + j + 1}];')
    else:
        if t >= N - 2:
            yield f'{b}[{i + N - 2}] = {a}[{i + N_2 - 1}];'
            if t >= N - 1:
                yield f'{b}[{i + N - 1}] = {a}[{i + N - 1}];'


if __name__ == '__main__':
    for line in generate(5, 10):
        print(line)
