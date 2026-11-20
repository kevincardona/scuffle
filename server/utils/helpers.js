function shuffle(array) {
    var currentIndex = array.length, temporaryValue, randomIndex;
    while (0 !== currentIndex) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;
        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }
    return array;
}

const letterCountMap = (word) => {
  let letters = Object.create(null);
  for(let i = 0; i < word.length; i++) {
    const currentLetter = word.charAt(i).toUpperCase()
    if (!letters[currentLetter])
      letters[currentLetter] = 0
    letters[currentLetter] = letters[currentLetter] + 1;
  }
  return letters;
}

const letterMapToWord = (letterMap) => {
  let word = []
  Object.keys(letterMap).forEach((letter) => {
    for(let i = 0; i < letterMap[letter]; i++) {
      word.push(letter.toUpperCase())
    }
  })
  return word.join('')
}

const checkWordContainsOther = (newWordMap, oldWordMap) => {
  const letters = Object.keys(oldWordMap);
  for(let i = 0; i < letters.length; i++) {
    let letter = letters[i];
    if (!newWordMap[letter] || oldWordMap[letter] > newWordMap[letter]) {
      return false
    }
    newWordMap[letter] -= oldWordMap[letter]
    if (newWordMap[letter] === 0)
      delete newWordMap[letter];
  }
  if (Object.keys(newWordMap).length === 0)
    return false
  return newWordMap
}

const checkCenterForWord = (word, flipped) => {
  const letters = [...word];
  let foundLetters = {}
  for (const letter of letters) {
    let found = false
    for(let i = 0; i < flipped.length; i++) {
      const flippedLetter = flipped[i];
      if (letter.toUpperCase() === flippedLetter.toUpperCase() && foundLetters[i] === undefined) {
        foundLetters[i] = i;
        found = true;
        break
      }
    }
    if (!found)
      return false;
  }
  return foundLetters
}


export { shuffle, letterCountMap, letterMapToWord, checkWordContainsOther, checkCenterForWord }