var UserInfo = (function(){
    let displayName = "";
    let charIndex = 0;

    function storeNameToLocalStorage() {
        // get name from input
        displayName = $('#displayname').val();
        // username
        if(displayName === "") {
            alert("이름을 입력해 주세요");
            $('#displayname').focus();
            return false;
        }
        if(displayName.length < 2) {
            alert("이름은 2자 이상 가능합니다");
            $('#displayname').focus();
            return false;
        }

        // get name from radios
        charIndex = $('input:radio[name=avatar]:checked').val();
        
        localStorage.setItem(
            "userinfo",
            JSON.stringify({
                display_name: displayName,
                char: charIndex
            })
        );

        console.log(displayName, charIndex)
        return true;
    }
    
    function restoreNameFromLocalStorage() {
        const storedUserInfo = localStorage.getItem("userinfo");

        if(!storedUserInfo) return false;
        const userInfo = JSON.parse(storedUserInfo);

        displayName = userInfo.display_name;
        if(!displayName || displayName === "" || displayName.length < 2) {
            console.error("이름 형식이 잘못되었습니다", displayName);
            return false;
        }
        $('#displayname').val(displayName);

        charIndex = userInfo.char;
        if(charIndex < 1 || charIndex > 8) {
            console.error("캐릭터 지정이 잘못되었습니다");
            return false;
        }
        $(`input:radio[name="avatar"]`).button('dispose');
        $(`.btn-profile-icon[data-index="${parseInt(charIndex)}"]`).button('toggle');
        $(`input:radio[name="avatar"]`).attr('checked', false);
        $(`input:radio[name="avatar"][value="${charIndex}"]`).prop('checked', true);
        // console.log($(`input:radio[name="avatar"]`))
// console.log($(`input:radio[name="avatar"][value="${charIndex}"]`))
        return true;
    }

    function getDisplayName() { return displayName }
    function getCharIndex() { return charIndex }    

    return {
        getDisplayName,
        getCharIndex,
        storeNameToLocalStorage,
        restoreNameFromLocalStorage
    }
})()