let compareDate = (start, end) => {
    // start and end format
    // YEAR-MM-DD
    start = parseInt( start.replace(/-/gi, ''), 10 );
    end = parseInt( end.replace(/-/gi, ''),10 );
    return start <= end;
};

module.exports = {
    compareDate: compareDate
};
